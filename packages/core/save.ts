import { createHash } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import {
  continuityIssues,
  documentVersions,
  readHeadByKey,
  scenes,
  type DocumentDoc,
  type DocumentVersionDoc,
  type SceneDoc,
} from '@epic/db';
import { classifyLines, extractScenes, findMarkers, textStats } from '@epic/fountain';
import { markStaleOnSave } from './continuity';
import { updateFirstAppearances } from './first-appearances';
import { Conflict, Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

/** At most one automatic checkpoint per document in this window. */
export const CHECKPOINT_EVERY_MS = 10 * 60_000;

export interface SavedText {
  text: string;
  version: number;
}

export interface VersionSummary {
  id: string;
  reason: DocumentVersionDoc['reason'];
  label: string;
  version: number;
  wordCount: number;
  createdAt: Date;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const pad = (n: number) => String(n).padStart(4, '0');
const unique = (xs: string[]) => [...new Set(xs)];

async function requireTextDocument(db: Db, ctx: ProjectContext, key: string): Promise<DocumentDoc> {
  const doc = await readHeadByKey(db, 'documents', ctx.scope, key);
  if (!doc) throw new NotFound('Document not found');
  if (doc.kind !== 'text') throw new Invalid(`"${doc.title}" is a container and has no text`);
  return doc;
}

/** Scene rows for a document's text. Scenes without a key marker yet are skipped. */
export function deriveScenes(
  ctx: ProjectContext,
  doc: DocumentDoc,
  text: string,
): Omit<SceneDoc, '_id' | 'createdAt' | 'updatedAt'>[] {
  const lines = text.split('\n');
  const types = doc.format === 'fountain' ? classifyLines(lines) : null;
  return extractScenes(text, doc.format).flatMap((s, i) => {
    if (!s.key) return [];
    const body = text.slice(s.from, s.to);
    const lastLine = s.line + body.split('\n').length - 1;
    const speaking: string[] = [];
    for (let n = s.line; types && n <= lastLine; n++) {
      if (types[n] !== 'character') continue;
      for (const m of findMarkers(lines[n] ?? ''))
        if (m.kind === 'mention' && m.key) speaking.push(m.key);
    }
    const stats = textStats(body, doc.format);
    return [
      {
        ...ctx.scope,
        sceneKey: s.key,
        workKey: doc.workKey,
        documentKey: doc.key,
        order: `${doc.orderPath}.${pad(i + 1)}`,
        heading: s.heading,
        range: { from: s.from, to: s.to },
        locationKey: null,
        storyTime: null,
        storylineKeys: [],
        povEntityKey: null,
        entityKeys: unique(
          findMarkers(body).flatMap((m) => (m.kind === 'mention' && m.key ? [m.key] : [])),
        ),
        speakingEntityKeys: unique(speaking),
        wordCount: stats.wordCount,
        estDuration: stats.estDuration,
      },
    ];
  });
}

/**
 * Saves the working text if nobody else saved since `baseVersion`; otherwise throws Conflict with
 * the current server text and version in `details`. Also rewrites the document's scenes and takes
 * an automatic checkpoint at most every CHECKPOINT_EVERY_MS.
 */
export async function saveWorkingText(
  db: Db,
  ctx: ProjectContext,
  input: { documentKey: string; text: string; baseVersion: number },
): Promise<{ version: number }> {
  const doc = await requireTextDocument(db, ctx, input.documentKey);
  const where = { ...ctx.scope, documentKey: doc.key };
  const textHash = hash(input.text);
  const { wordCount, pageCount } = textStats(input.text, doc.format);

  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      // Issues follow the text without re-running checks; the old text is read only when needed.
      const issues = await continuityIssues.listForDocument(db, where, undefined, { session });
      const before = issues.length
        ? await documentVersions.findWorking(db, where, { session })
        : null;
      const saved = await documentVersions.saveWorking(
        db,
        { ...where, baseVersion: input.baseVersion },
        { text: input.text, textHash, wordCount, pageCount },
        { session },
      );
      if (!saved) {
        const current = await documentVersions.findWorking(db, where, { session });
        throw new Conflict(`"${doc.title}" changed on another device since you opened it`, {
          current: { text: current?.text ?? '', version: current?.version ?? 0 },
        });
      }
      await scenes.replaceForDocument(db, where, deriveScenes(ctx, doc, input.text), { session });
      await updateFirstAppearances(db, session, ctx, doc, input.text);
      if (before) await markStaleOnSave(db, issues, before.text, input.text, { session });

      const last = await documentVersions.latestSnapshot(db, where, { session });
      const due = !last || Date.now() - last.createdAt.getTime() >= CHECKPOINT_EVERY_MS;
      if (due && last?.textHash !== textHash) {
        await documentVersions.insertSnapshot(
          db,
          {
            ...where,
            version: saved.version,
            text: input.text,
            seq: null,
            reason: 'autosave-checkpoint',
            label: '',
            textHash,
            wordCount,
            pageCount,
          },
          { session },
        );
      }
      return { version: saved.version };
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Takes a snapshot of the working text, or of `text` when given (e.g. unsaved text from this
 * device that a conflict is about to replace).
 */
export async function createSnapshot(
  db: Db,
  ctx: ProjectContext,
  input: { documentKey: string; label: string; reason: 'manual' | 'before-ai'; text?: string },
): Promise<VersionSummary> {
  const doc = await requireTextDocument(db, ctx, input.documentKey);
  const where = { ...ctx.scope, documentKey: doc.key };
  const working = await documentVersions.findWorking(db, where);
  const text = input.text ?? working?.text ?? '';
  const { wordCount, pageCount } = textStats(text, doc.format);
  const snap = await documentVersions.insertSnapshot(db, {
    ...where,
    version: working?.version ?? 0,
    text,
    seq: null,
    reason: input.reason,
    label: input.label.trim(),
    textHash: hash(text),
    wordCount,
    pageCount,
  });
  return toSummary(snap);
}

function toSummary(v: Omit<DocumentVersionDoc, 'text'>): VersionSummary {
  return {
    id: v._id.toHexString(),
    reason: v.reason,
    label: v.label,
    version: v.version,
    wordCount: v.wordCount,
    createdAt: v.createdAt,
  };
}

export async function listVersions(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
): Promise<VersionSummary[]> {
  const doc = await requireTextDocument(db, ctx, documentKey);
  return (await documentVersions.listSnapshots(db, { ...ctx.scope, documentKey: doc.key })).map(
    toSummary,
  );
}

async function requireSnapshot(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
  versionId: string,
) {
  const snap = ObjectId.isValid(versionId)
    ? await documentVersions.findSnapshot(db, {
        ...ctx.scope,
        documentKey,
        id: new ObjectId(versionId),
      })
    : null;
  if (!snap) throw new NotFound('Version not found');
  return snap;
}

export async function getVersion(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
  versionId: string,
): Promise<VersionSummary & { text: string }> {
  await requireTextDocument(db, ctx, documentKey);
  const snap = await requireSnapshot(db, ctx, documentKey, versionId);
  return { ...toSummary(snap), text: snap.text };
}

/**
 * Makes a snapshot's text the working text. The current text is snapshotted first, so a restore
 * can itself be undone from history.
 */
export async function restoreVersion(
  db: Db,
  ctx: ProjectContext,
  input: { documentKey: string; versionId: string; baseVersion: number },
): Promise<SavedText> {
  const snap = await requireSnapshot(db, ctx, input.documentKey, input.versionId);
  await createSnapshot(db, ctx, {
    documentKey: input.documentKey,
    label: 'Before restore',
    reason: 'manual',
  });
  const { version } = await saveWorkingText(db, ctx, {
    documentKey: input.documentKey,
    text: snap.text,
    baseVersion: input.baseVersion,
  });
  return { text: snap.text, version };
}
