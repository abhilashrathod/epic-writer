import type { Db, ObjectId } from 'mongodb';
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
import type { DocumentDetails } from '@epic/schemas/api';

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

const level = (key: string, singular: string, plural: string): WorkLevel => ({
  key,
  singular,
  plural,
  numbering: 'arabic',
  labelFormat: '{singular} {number}',
});

/** Default structure per medium until templates (PR-2) define their own. */
export const DEFAULT_STRUCTURES: Record<
  WorkMedium,
  { levels: WorkLevel[]; contentType: ContentType }
> = {
  series: {
    levels: [level('season', 'Season', 'Seasons'), level('episode', 'Episode', 'Episodes')],
    contentType: 'screenplay',
  },
  film: { levels: [level('script', 'Script', 'Scripts')], contentType: 'screenplay' },
  short: { levels: [level('script', 'Script', 'Scripts')], contentType: 'screenplay' },
  stage: { levels: [level('act', 'Act', 'Acts')], contentType: 'screenplay' },
  game: { levels: [level('chapter', 'Chapter', 'Chapters')], contentType: 'screenplay' },
  novel: { levels: [level('chapter', 'Chapter', 'Chapters')], contentType: 'prose' },
  trilogy: {
    levels: [level('book', 'Book', 'Books'), level('chapter', 'Chapter', 'Chapters')],
    contentType: 'prose',
  },
  other: { levels: [level('part', 'Part', 'Parts')], contentType: 'prose' },
};

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
  input: { name: string; medium: WorkMedium },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Invalid('Name the work');
  const { levels, contentType } = DEFAULT_STRUCTURES[input.medium];
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
      await commitInSession(db, session, {
        ...ctx.scope,
        message: `Add ${title}`,
        author: author(ctx),
        changes: [{ op: 'create', collection: 'documents', key, data }],
      });
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
  await commit(db, {
    ...ctx.scope,
    message: `Move "${doc.title}" ${direction}`,
    author: author(ctx),
    changes: renumber(siblings, parentPath, all),
  });
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
  await commit(db, {
    ...ctx.scope,
    message: `Delete "${doc.title}"`,
    author: author(ctx),
    changes: [
      ...[...doomed].map((k): Change => ({ op: 'delete', collection: 'documents', key: k })),
      ...renumber(remaining, parentPath, all),
    ],
  });
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
