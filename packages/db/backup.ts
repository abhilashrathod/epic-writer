import type { ClientSession, Db, Document, ObjectId } from 'mongodb';
import { col } from './client';
import { VERSIONED_COLLECTIONS, type JobStatus, type ProjectDoc } from './collections';

/**
 * Every collection whose rows belong to one project, besides `projects` itself. `users` (AI keys)
 * and `templates` (owned by users, not projects) are deliberately absent.
 */
export const PROJECT_COLLECTIONS = [
  ...VERSIONED_COLLECTIONS,
  'branches',
  'commits',
  'jobs',
  'documentVersions',
  'scenes',
  'narrativeOrder',
  'annotations',
  'proposals',
  'continuityIssues',
  'chunks',
  'aiUsage',
  'assets',
  'savedViews',
] as const;
export type ProjectCollection = (typeof PROJECT_COLLECTIONS)[number];

const LIVE_OR_DONE: JobStatus[] = ['queued', 'running', 'done'];

export const backups = {
  /** Every row of one collection in a project, all versions, oldest first. */
  projectRows: (db: Db, name: ProjectCollection, projectId: ObjectId) =>
    db.collection<Document>(name).find({ projectId }).sort({ _id: 1 }).toArray(),

  /** Only the name: user rows also hold encrypted AI keys, which never leave the database. */
  async userName(db: Db, id: ObjectId): Promise<string | null> {
    const u = await col(db, 'users').findOne({ _id: id }, { projection: { name: 1 } });
    return u?.name ?? null;
  },

  /**
   * Replaces everything a project owns with `rows` (a restore, IO-7), inside the caller's
   * transaction. Rows keep their ids, versions and history.
   */
  async replaceProject(
    db: Db,
    project: ProjectDoc,
    rows: Partial<Record<ProjectCollection, Document[]>>,
    session: ClientSession,
  ): Promise<number> {
    const projectId = project._id;
    await col(db, 'projects').deleteOne({ _id: projectId }, { session });
    let n = 0;
    for (const name of PROJECT_COLLECTIONS) {
      await db.collection(name).deleteMany({ projectId }, { session });
      const list = (rows[name] ?? []).filter((r) => projectId.equals(r.projectId as ObjectId));
      if (list.length) await db.collection(name).insertMany(list, { session });
      n += list.length;
    }
    await col(db, 'projects').insertOne(project, { session });
    return n;
  },

  listProjects: (db: Db) =>
    col(db, 'projects')
      .find({}, { projection: { _id: 1, mainBranchId: 1 } })
      .toArray(),

  /** Export jobs that block a new backup: live or done since `since`, or failed since `failedSince`. */
  recentExportJobs: (db: Db, since: Date, failedSince: Date) =>
    col(db, 'jobs')
      .find(
        {
          type: 'export',
          $or: [
            { status: { $in: LIVE_OR_DONE }, createdAt: { $gte: since } },
            { status: 'failed', createdAt: { $gte: failedSince } },
          ],
        },
        { projection: { projectId: 1, createdAt: 1 } },
      )
      .toArray(),
};
