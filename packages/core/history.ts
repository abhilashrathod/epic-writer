import { MongoServerError, type ClientSession, type Db } from 'mongodb';
import {
  commits,
  readCommitVersions,
  VERSIONED_COLLECTIONS,
  type CommitDoc,
  type VersionedCollection,
  type VersionedEnvelope,
} from '@epic/db';
import { commitInSession, versionBody, type Change, type CommitResult } from './commit';
import { Conflict, Invalid, NotFound } from './errors';
import { syncNarrativeOrder } from './narrative-index';
import type { ProjectContext } from './works';

export interface CommitSummary {
  seq: number;
  message: string;
  author: CommitDoc['author'];
  auto: boolean;
  stats: CommitDoc['stats'];
  createdAt: Date;
}

export interface CommitChange {
  collection: VersionedCollection;
  key: string;
  op: 'create' | 'update' | 'delete';
  label: string;
}

const summary = (c: CommitDoc): CommitSummary => ({
  seq: c.seq,
  message: c.message,
  author: c.author,
  auto: c.auto,
  stats: c.stats,
  createdAt: c.createdAt,
});

/** Commit history, newest first (BR-2). Page with `before` = the last seq you got. */
export async function listCommits(
  db: Db,
  ctx: ProjectContext,
  opts: { before?: number; limit?: number } = {},
): Promise<CommitSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return (await commits.page(db, { ...ctx.scope, before: opts.before, limit })).map(summary);
}

/** A readable name for any versioned row, for history lists. */
function labelOf(row: VersionedEnvelope): string {
  const r = row as unknown as Record<string, unknown>;
  for (const k of ['name', 'title', 'label', 'field'])
    if (typeof r[k] === 'string' && r[k]) return r[k] as string;
  return row.key;
}

interface Touched {
  collection: VersionedCollection;
  /** The version this commit wrote. */
  row: VersionedEnvelope;
  /** The version it replaced, if any. */
  prior: VersionedEnvelope | undefined;
}

async function touched(
  db: Db,
  ctx: ProjectContext,
  seq: number,
  session?: ClientSession,
): Promise<Touched[]> {
  const out: Touched[] = [];
  for (const collection of VERSIONED_COLLECTIONS) {
    const rows: VersionedEnvelope[] = await readCommitVersions(db, collection, ctx.scope, seq, {
      session,
    });
    const priors = new Map(rows.filter((r) => r.seq !== seq).map((r) => [r.key, r]));
    for (const row of rows)
      if (row.seq === seq) out.push({ collection, row, prior: priors.get(row.key) });
  }
  return out;
}

const opOf = (t: Touched): CommitChange['op'] =>
  t.row.deleted ? 'delete' : t.prior && !t.prior.deleted ? 'update' : 'create';

/** One commit with what it changed: every row it created, updated or deleted. */
export async function getCommit(
  db: Db,
  ctx: ProjectContext,
  seq: number,
): Promise<CommitSummary & { changes: CommitChange[] }> {
  const c = await commits.find(db, { ...ctx.scope, seq });
  if (!c) throw new NotFound(`Commit ${seq} not found`);
  const changes = (await touched(db, ctx, seq)).map((t) => ({
    collection: t.collection,
    key: t.row.key,
    op: opOf(t),
    label: labelOf(t.prior && t.row.deleted ? t.prior : t.row),
  }));
  return { ...summary(c), changes };
}

/**
 * Undoes a commit with a new commit that puts every row it touched back the way it was: created
 * rows are deleted, updated rows get their prior version, deleted rows come back. History is never
 * rewritten. Refused when a later commit changed one of those rows; undo that one first.
 */
export async function undoCommit(db: Db, ctx: ProjectContext, seq: number): Promise<CommitResult> {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const c = await commits.find(db, { ...ctx.scope, seq }, { session });
      if (!c) throw new NotFound(`Commit ${seq} not found`);
      const rows = await touched(db, ctx, seq, session);
      if (!rows.length) throw new Invalid(`Commit ${seq} changed nothing to undo`);

      const later = rows.filter((t) => !t.row.isHead);
      if (later.length) {
        const names = later.map((t) => `"${labelOf(t.row)}" (commit ${t.row.supersededSeq})`);
        throw new Conflict(
          `Later commits changed ${names.join(', ')}. Undo those first, newest first.`,
        );
      }

      const changes: Change[] = rows.map((t): Change => {
        const { collection, row, prior } = t;
        // No prior version: the commit created it. A deleted prior: the commit restored it.
        if (!prior || prior.deleted) return { op: 'delete', collection, key: row.key };
        const data: Record<string, unknown> = versionBody(prior);
        // First appearances are derived from the text, which undo doesn't touch.
        if (collection === 'entities')
          data.firstAppearances = (row as unknown as Record<string, unknown>).firstAppearances;
        return { op: row.deleted ? 'restore' : 'update', collection, key: row.key, data };
      });
      const undone = await commitInSession(db, session, {
        ...ctx.scope,
        message: `Undo "${c.message}"`,
        author: { kind: 'user', userId: ctx.userId },
        changes,
      });
      // Positions aren't versioned, so they follow the restored tree here.
      if (rows.some((t) => t.collection === 'documents'))
        await syncNarrativeOrder(db, session, ctx);
      return undone;
    });
  } catch (e) {
    if (e instanceof MongoServerError && e.code === 11000)
      throw new Conflict(
        'Undo would bring back a name that another entry now uses. Rename one first.',
      );
    throw e;
  } finally {
    await session.endSession();
  }
}
