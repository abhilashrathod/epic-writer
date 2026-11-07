import type { Db, Document, ObjectId } from 'mongodb';
import { col } from './client';
import { VERSIONED_COLLECTIONS, type JobStatus } from './collections';

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
