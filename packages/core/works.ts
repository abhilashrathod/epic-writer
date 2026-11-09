import type { ClientSession, Db, ObjectId } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import {
  documentVersions,
  projects,
  readHeadByKey,
  readHeads,
  type BranchScope,
  type ContentType,
  type DocumentDoc,
  type ProjectDoc,
  type WorkDoc,
  type WorkLevel,
  type WorkMedium,
} from '@epic/db';
import { commit, commitInSession, versionBody, type Change } from './commit';
import { emptyOverview, emptyVisual } from './defaults';
import { Invalid, NotFound } from './errors';
import {
  applyTreeChanges,
  loadNarrativeIndex,
  narrativeOrderChanges,
  syncSceneOrders,
} from './narrative-index';
import {
  DEFAULT_LEVELS,
  levelNamesSchema,
  type DocumentDetails,
  type LevelNames,
} from '@epic/schemas/api';

/** Who is acting, in which project and on which branch. */
export interface ProjectContext {
  project: ProjectDoc;
  scope: BranchScope;
  userId: ObjectId;
}

/** Loads a project the user belongs to. Unknown and foreign projects both read as NotFound. */
export async function openProject(
  db: Db,
  projectId: ObjectId,
  userId: ObjectId,
): Promise<ProjectContext> {
  const project = await projects.findById(db, projectId);
  if (!project || !project.members.some((m) => m.userId.equals(userId))) {
    throw new NotFound('Project not found');
  }
  // Phase 1 writes only to main; later phases pick the branch here.
  return { project, scope: { projectId, branchId: project.mainBranchId }, userId };
}

/**
 * Levels from names. Keys stay stable by position (documents point at them), so renaming a level
 * keeps its documents; new levels get a key from their name.
 */
export function levelsFrom(names: LevelNames, existing: WorkLevel[] = []): WorkLevel[] {
  const taken = new Set<string>();
  return names.map((n, i) => {
    const old = existing[i];
    let key = old?.key ?? (n.singular.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'level');
    for (let k = 2; !old && taken.has(key); k++) key = `${key.replace(/\d+$/, '')}${k}`;
    taken.add(key);
    return {
      key,
      singular: n.singular,
      plural: n.plural,
      numbering: old?.numbering ?? 'arabic',
      labelFormat: old?.labelFormat ?? '{singular} {number}',
    };
  });
}

const SCRIPT_MEDIA = new Set<WorkMedium>(['series', 'film', 'short', 'stage', 'game']);
const contentTypeFor = (m: WorkMedium): ContentType =>
  SCRIPT_MEDIA.has(m) ? 'screenplay' : 'prose';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });
const pad = (n: number) => String(n).padStart(4, '0');
const joinPath = (parent: string, n: number) => (parent ? `${parent}.${pad(n)}` : pad(n));

function label(lvl: WorkLevel, n: number): string {
  return lvl.labelFormat.replace('{singular}', lvl.singular).replace('{number}', String(n));
}

export interface WorkTree {
  works: WorkDoc[];
  documents: DocumentDoc[];
}

/** Every work and document on the branch, in display order. */
export async function getTree(db: Db, ctx: ProjectContext): Promise<WorkTree> {
  const [works, documents] = await Promise.all([
    readHeads(db, 'works', ctx.scope),
    readHeads(db, 'documents', ctx.scope),
  ]);
  works.sort((a, b) => a.order - b.order);
  documents.sort((a, b) => a.orderPath.localeCompare(b.orderPath));
  return { works, documents };
}

export async function createWork(
  db: Db,
  ctx: ProjectContext,
  input: { name: string; medium: WorkMedium; levels?: LevelNames },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Invalid('Name the work');
  const levels = levelsFrom(levelNamesSchema.parse(input.levels ?? DEFAULT_LEVELS[input.medium]));
  const contentType = contentTypeFor(input.medium);
  const order = (await readHeads(db, 'works', ctx.scope)).length;
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Create work "${name}"`,
    author: author(ctx),
    changes: [
      {
        op: 'create',
        collection: 'works',
        data: {
          name,
          medium: input.medium,
          levels,
          defaultContentType: contentType,
          status: 'planning',
          order,
          overview: emptyOverview(),
          visual: emptyVisual(),
          inspirations: [],
          frameworkKey: null,
        },
      },
    ],
  });
  return keys[0]!;
}

async function workDocuments(db: Db, ctx: ProjectContext, workKey: string): Promise<DocumentDoc[]> {
  return readHeads(db, 'documents', ctx.scope, { workKey });
}

function childrenOf(docs: DocumentDoc[], parentKey: string | null): DocumentDoc[] {
  return docs.filter((d) => d.parentKey === parentKey).sort((a, b) => a.number - b.number);
}

/**
 * Update changes that give `ordered` the numbers 1..n under `parentPath`, rewriting descendants'
 * order paths when a parent's path moves. Unchanged documents produce no change.
 */
function renumber(ordered: DocumentDoc[], parentPath: string, all: DocumentDoc[]): Change[] {
  const changes: Change[] = [];
  ordered.forEach((doc, i) => {
    const number = i + 1;
    const orderPath = joinPath(parentPath, number);
    if (doc.number === number && doc.orderPath === orderPath) return;
    changes.push({
      op: 'update',
      collection: 'documents',
      key: doc.key,
      data: { ...versionBody(doc), number, orderPath },
    });
    changes.push(...renumber(childrenOf(all, doc.key), orderPath, all));
  });
  return changes;
}

/**
 * Commits a change to the document tree together with every stored narrative order it shifts, then
 * moves the scene rows to match. A new last episode shifts where its container ends, so additions
 * come through here too.
 */
async function commitTree(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
  message: string,
  changes: Change[],
): Promise<void> {
  const index = applyTreeChanges(await loadNarrativeIndex(db, ctx, session), changes);
  await commitInSession(db, session, {
    ...ctx.scope,
    message,
    author: author(ctx),
    changes: [...changes, ...(await narrativeOrderChanges(db, ctx, index, session))],
  });
  await syncSceneOrders(db, session, ctx);
}

async function inTransaction(db: Db, run: (session: ClientSession) => Promise<void>) {
  const session = db.client.startSession();
  try {
    await session.withTransaction(() => run(session));
  } finally {
    await session.endSession();
  }
}

/**
 * Adds a season, episode, chapter... under `parentKey` (or at the top of the work). `contentType`
 * overrides the work's default, e.g. notes in a prose work.
 */
export async function createDocument(
  db: Db,
  ctx: ProjectContext,
  input: { workKey: string; parentKey: string | null; title?: string; contentType?: ContentType },
): Promise<string> {
  const work = await readHeadByKey(db, 'works', ctx.scope, input.workKey);
  if (!work) throw new NotFound('Work not found');
  const parent = input.parentKey
    ? await readHeadByKey(db, 'documents', ctx.scope, input.parentKey)
    : null;
  if (input.parentKey && (!parent || parent.workKey !== work.key))
    throw new NotFound('Parent not found in this work');

  const depth = parent ? work.levels.findIndex((l) => l.key === parent.levelKey) + 1 : 0;
  const lvl = work.levels[depth];
  if (!lvl) throw new Invalid(`A ${parent?.levelKey ?? 'document'} can't hold anything below it`);
  const kind = depth === work.levels.length - 1 ? 'text' : 'container';

  const siblings = childrenOf(await workDocuments(db, ctx, work.key), parent?.key ?? null);
  const number = siblings.length + 1;
  const key = uuidv7();
  const title = input.title?.trim() || label(lvl, number);
  const contentType = input.contentType ?? work.defaultContentType;
  const data = {
    workKey: work.key,
    parentKey: parent?.key ?? null,
    levelKey: lvl.key,
    kind,
    contentType,
    format: contentType === 'screenplay' ? 'fountain' : 'markdown',
    title,
    number,
    orderPath: joinPath(parent?.orderPath ?? '', number),
    storyTime: null,
    logline: '',
    summary: '',
    arcSummary: '',
    keyEventKeys: [],
  };

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await commitTree(db, session, ctx, `Add ${title}`, [
        { op: 'create', collection: 'documents', key, data },
      ]);
      if (kind === 'text') {
        await documentVersions.createWorking(db, { ...ctx.scope, documentKey: key }, { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return key;
}

async function requireDocument(db: Db, ctx: ProjectContext, key: string): Promise<DocumentDoc> {
  const doc = await readHeadByKey(db, 'documents', ctx.scope, key);
  if (!doc) throw new NotFound('Document not found');
  return doc;
}

export async function renameDocument(
  db: Db,
  ctx: ProjectContext,
  key: string,
  title: string,
): Promise<void> {
  const doc = await requireDocument(db, ctx, key);
  const clean = title.trim();
  if (!clean) throw new Invalid('Title is empty');
  if (clean === doc.title) return;
  await commit(db, {
    ...ctx.scope,
    message: `Rename "${doc.title}" to "${clean}"`,
    author: author(ctx),
    changes: [
      { op: 'update', collection: 'documents', key, data: { ...versionBody(doc), title: clean } },
    ],
  });
}

/** Sets when an episode or chapter happens in story time (null clears it). */
export async function setDocumentStoryTime(
  db: Db,
  ctx: ProjectContext,
  key: string,
  storyTime: DocumentDoc['storyTime'],
): Promise<void> {
  const doc = await requireDocument(db, ctx, key);
  await commit(db, {
    ...ctx.scope,
    message: `Set when "${doc.title}" happens`,
    author: author(ctx),
    changes: [
      { op: 'update', collection: 'documents', key, data: { ...versionBody(doc), storyTime } },
    ],
  });
}

/**
 * Sets an episode's or chapter's logline, summary and key events, or a container's arc summary
 * (WK-5). Key events must be live entries whose type has the `event` trait.
 */
export async function setDocumentDetails(
  db: Db,
  ctx: ProjectContext,
  key: string,
  details: DocumentDetails,
): Promise<void> {
  const doc = await requireDocument(db, ctx, key);
  const allowed =
    doc.kind === 'container' ? ['arcSummary'] : ['logline', 'summary', 'keyEventKeys'];
  const wrong = Object.keys(details).filter((k) => !allowed.includes(k));
  if (wrong.length) throw new Invalid(`"${doc.title}" has no ${wrong.join(', ')}`);

  if (details.keyEventKeys?.length) {
    const keys = [...new Set(details.keyEventKeys)];
    details = { ...details, keyEventKeys: keys };
    const [found, types] = await Promise.all([
      readHeads(db, 'entities', ctx.scope, { key: { $in: keys } }),
      readHeads(db, 'entityTypes', ctx.scope),
    ]);
    const events = new Set(types.filter((t) => t.traits.includes('event')).map((t) => t.key));
    const ok = new Set(
      found.filter((e) => events.has(e.typeKey) && e.canonState !== 'scrapped').map((e) => e.key),
    );
    if (keys.some((k) => !ok.has(k)))
      throw new Invalid('Key events must be existing, unscrapped entries of an event type');
  }

  const next = { ...versionBody(doc), ...details };
  const same = (Object.keys(details) as (keyof DocumentDetails)[]).every(
    (k) => JSON.stringify(next[k]) === JSON.stringify(doc[k]),
  );
  if (same) return;
  await commit(db, {
    ...ctx.scope,
    message: `Edit details of "${doc.title}"`,
    author: author(ctx),
    changes: [{ op: 'update', collection: 'documents', key, data: next }],
  });
}

/**
 * WK-2: renames a work's levels, or reshapes them while the work has no documents yet (existing
 * documents sit at fixed depths, so the number of levels is locked once there are any).
 */
export async function setWorkLevels(
  db: Db,
  ctx: ProjectContext,
  workKey: string,
  names: LevelNames,
): Promise<void> {
  const work = await readHeadByKey(db, 'works', ctx.scope, workKey);
  if (!work) throw new NotFound('Work not found');
  const parsed = levelNamesSchema.parse(names);
  const docs = await workDocuments(db, ctx, workKey);
  if (docs.length && parsed.length !== work.levels.length)
    throw new Invalid(
      `"${work.name}" already has documents, so its levels can be renamed but not added or removed`,
    );
  await commit(db, {
    ...ctx.scope,
    message: `Edit the structure of "${work.name}"`,
    author: author(ctx),
    changes: [
      {
        op: 'update',
        collection: 'works',
        key: workKey,
        data: { ...versionBody(work), levels: levelsFrom(parsed, work.levels) },
      },
    ],
  });
}

/** Swaps a document with its neighbour. Moving past either end does nothing. */
export async function moveDocument(
  db: Db,
  ctx: ProjectContext,
  key: string,
  direction: 'up' | 'down',
): Promise<void> {
  const doc = await requireDocument(db, ctx, key);
  const all = await workDocuments(db, ctx, doc.workKey);
  const siblings = childrenOf(all, doc.parentKey);
  const i = siblings.findIndex((d) => d.key === key);
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  const parentPath = doc.parentKey
    ? (all.find((d) => d.key === doc.parentKey)?.orderPath ?? '')
    : '';
  await inTransaction(db, (session) =>
    commitTree(
      db,
      session,
      ctx,
      `Move "${doc.title}" ${direction}`,
      renumber(siblings, parentPath, all),
    ),
  );
}

/** Deletes a document and everything under it, then closes the gap in numbering. */
export async function deleteDocument(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const doc = await requireDocument(db, ctx, key);
  const all = await workDocuments(db, ctx, doc.workKey);
  const doomed = new Set<string>();
  const collect = (k: string) => {
    doomed.add(k);
    for (const c of childrenOf(all, k)) collect(c.key);
  };
  collect(key);
  const remaining = childrenOf(all, doc.parentKey).filter((d) => d.key !== key);
  const parentPath = doc.parentKey
    ? (all.find((d) => d.key === doc.parentKey)?.orderPath ?? '')
    : '';
  await inTransaction(db, (session) =>
    commitTree(db, session, ctx, `Delete "${doc.title}"`, [
      ...[...doomed].map((k): Change => ({ op: 'delete', collection: 'documents', key: k })),
      ...renumber(remaining, parentPath, all),
    ]),
  );
}

/** The working text of a script or chapter, with its version for optimistic saves. */
export async function getWorkingText(
  db: Db,
  ctx: ProjectContext,
  key: string,
): Promise<{ document: DocumentDoc; text: string; version: number }> {
  const document = await requireDocument(db, ctx, key);
  if (document.kind !== 'text')
    throw new Invalid(`"${document.title}" is a container and has no text`);
  const working = await documentVersions.findWorking(db, { ...ctx.scope, documentKey: key });
  return { document, text: working?.text ?? '', version: working?.version ?? 0 };
}
