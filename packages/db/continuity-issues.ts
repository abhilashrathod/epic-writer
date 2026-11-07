import { ObjectId, type AnyBulkWriteOperation, type ClientSession, type Db } from 'mongodb';
import { col } from './client';
import type { ContinuityIssueDoc, TextRange } from './collections';

type Opts = { session?: ClientSession };
type Where = { projectId: ObjectId; branchId: ObjectId; documentKey: string };
type Status = ContinuityIssueDoc['status'];
export type NewContinuityIssue = Omit<ContinuityIssueDoc, '_id' | 'createdAt' | 'updatedAt'>;

export const continuityIssues = {
  listForDocument: (db: Db, p: Where, statuses?: Status[], opts: Opts = {}) =>
    col(db, 'continuityIssues')
      .find(statuses ? { ...p, status: { $in: statuses } } : p, opts)
      .sort({ 'range.from': 1 })
      .toArray(),

  findById: (db: Db, p: { projectId: ObjectId; branchId: ObjectId; id: ObjectId }) =>
    col(db, 'continuityIssues').findOne({
      _id: p.id,
      projectId: p.projectId,
      branchId: p.branchId,
    }),

  /** Replaces a document's issues with a new run's, keeping the rows in `keep` (dismissed ones). */
  async replaceForDocument(
    db: Db,
    p: Where,
    keep: ObjectId[],
    rows: NewContinuityIssue[],
    opts: Opts = {},
  ): Promise<void> {
    await col(db, 'continuityIssues').deleteMany({ ...p, _id: { $nin: keep } }, opts);
    if (!rows.length) return;
    const now = new Date();
    await col(db, 'continuityIssues').insertMany(
      rows.map((r) => ({ ...r, _id: new ObjectId(), createdAt: now, updatedAt: now })),
      opts,
    );
  },

  setStatus: (
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; id: ObjectId },
    status: Status,
  ) =>
    col(db, 'continuityIssues').updateOne(
      { _id: p.id, projectId: p.projectId, branchId: p.branchId },
      { $set: { status, updatedAt: new Date() } },
    ),

  /** Moves ranges and changes statuses after a text edit, in one round trip. */
  async applyEdits(
    db: Db,
    edits: { id: ObjectId; range: TextRange | null; status: Status }[],
    opts: Opts = {},
  ): Promise<void> {
    if (!edits.length) return;
    const now = new Date();
    const ops: AnyBulkWriteOperation<ContinuityIssueDoc>[] = edits.map((e) => ({
      updateOne: {
        filter: { _id: e.id },
        update: { $set: { range: e.range, status: e.status, updatedAt: now } },
      },
    }));
    await col(db, 'continuityIssues').bulkWrite(ops, opts);
  },
};
