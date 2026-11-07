import type { ClientSession, Db, Filter, ObjectId } from 'mongodb';
import type { VersionedCollection, VersionedCollections, VersionedEnvelope } from './collections';

export interface BranchScope {
  projectId: ObjectId;
  branchId: ObjectId;
}

type Doc<C extends VersionedCollection> = VersionedCollections[C];

// Mongo's Filter<T> can't be built over a generic union of doc types, so reads go through the
// envelope type and results are cast back to the collection's doc type here, in one place.
function vcol(db: Db, name: VersionedCollection) {
  return db.collection<VersionedEnvelope>(name);
}
function where(f: Record<string, unknown>): Filter<VersionedEnvelope> {
  return f as Filter<VersionedEnvelope>;
}

/** Current live versions on a branch. */
export function readHeads<C extends VersionedCollection>(
  db: Db,
  collection: C,
  scope: BranchScope,
  filter: Record<string, unknown> = {},
  opts: { session?: ClientSession } = {},
): Promise<Doc<C>[]> {
  const q = where({ ...filter, ...scope, isHead: true, deleted: false });
  return vcol(db, collection).find(q, opts).toArray() as unknown as Promise<Doc<C>[]>;
}

/** Current version of one key, or null if missing. Tombstones count as missing unless asked for. */
export async function readHeadByKey<C extends VersionedCollection>(
  db: Db,
  collection: C,
  scope: BranchScope,
  key: string,
  opts: { includeDeleted?: boolean; session?: ClientSession } = {},
): Promise<Doc<C> | null> {
  const q = where({ ...scope, key, isHead: true });
  const doc = (await vcol(db, collection).findOne(q, {
    session: opts.session,
  })) as unknown as Doc<C> | null;
  if (!doc || (doc.deleted && !opts.includeDeleted)) return null;
  return doc;
}

/** Versions that were live right after commit `seq` on this branch. */
export function readAtSeq<C extends VersionedCollection>(
  db: Db,
  collection: C,
  scope: BranchScope,
  seq: number,
  filter: Record<string, unknown> = {},
): Promise<Doc<C>[]> {
  const q = where({
    ...filter,
    ...scope,
    seq: { $lte: seq },
    $or: [{ supersededSeq: null }, { supersededSeq: { $gt: seq } }],
    deleted: false,
  });
  return vcol(db, collection).find(q).toArray() as unknown as Promise<Doc<C>[]>;
}

/**
 * Every version commit `seq` touched: the rows it wrote (`seq`) and the heads it closed
 * (`supersededSeq`). Rare, on-demand reads (history, undo), so no dedicated index.
 */
export function readCommitVersions<C extends VersionedCollection>(
  db: Db,
  collection: C,
  scope: BranchScope,
  seq: number,
  opts: { session?: ClientSession } = {},
): Promise<Doc<C>[]> {
  const q = where({ ...scope, $or: [{ seq }, { supersededSeq: seq }] });
  return vcol(db, collection).find(q, opts).toArray() as unknown as Promise<Doc<C>[]>;
}
