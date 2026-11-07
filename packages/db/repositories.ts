import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { col } from './client';
import type { BranchDoc, CommitDoc, JobDoc, JobType, ProjectDoc, UserDoc } from './collections';

type Opts = { session?: ClientSession };
/** Insert input: `_id` is optional so callers can pre-allocate ids that reference each other. */
type NewDoc<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'> & { _id?: ObjectId };

function stamp<T>(doc: NewDoc<T>): T {
  const now = new Date();
  return { ...doc, _id: doc._id ?? new ObjectId(), createdAt: now, updatedAt: now } as T;
}

// ---------- users ----------

export const users = {
  findById: (db: Db, id: ObjectId) => col(db, 'users').findOne({ _id: id }),
  findByGithubLogin: (db: Db, githubLogin: string) => col(db, 'users').findOne({ githubLogin }),

  /** Creates the user on first sign-in; refreshes name and email afterwards. */
  async upsertFromGithub(
    db: Db,
    p: { githubLogin: string; email: string; name: string },
  ): Promise<UserDoc> {
    const now = new Date();
    const res = await col(db, 'users').findOneAndUpdate(
      { githubLogin: p.githubLogin },
      {
        $set: { email: p.email, name: p.name, updatedAt: now },
        $setOnInsert: {
          githubLogin: p.githubLogin,
          aiKeys: [],
          preferences: {
            skin: 'ink',
            theme: 'system',
            editorFont: 'Courier Prime',
            defaultTemplate: 'blank',
          },
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (!res) throw new Error('user upsert returned nothing');
    return res;
  },

  updatePreferences: (db: Db, id: ObjectId, prefs: Partial<UserDoc['preferences']>) =>
    col(db, 'users').updateOne(
      { _id: id },
      {
        $set: {
          ...Object.fromEntries(Object.entries(prefs).map(([k, v]) => [`preferences.${k}`, v])),
          updatedAt: new Date(),
        },
      },
    ),
};

// ---------- projects ----------

export const projects = {
  async insert(db: Db, doc: NewDoc<ProjectDoc>, opts: Opts = {}): Promise<ProjectDoc> {
    const full = stamp<ProjectDoc>(doc);
    await col(db, 'projects').insertOne(full, opts);
    return full;
  },
  findById: (db: Db, id: ObjectId, opts: Opts = {}) =>
    col(db, 'projects').findOne({ _id: id }, opts),
  listForUser: (db: Db, userId: ObjectId) =>
    col(db, 'projects')
      .find({ $or: [{ ownerId: userId }, { 'members.userId': userId }] })
      .sort({ createdAt: -1 })
      .toArray(),

  /** Atomically reserves the next commit seq for a project. */
  async nextSeq(db: Db, projectId: ObjectId, opts: Opts = {}): Promise<number | null> {
    const res = await col(db, 'projects').findOneAndUpdate(
      { _id: projectId },
      { $inc: { seqCounter: 1 }, $set: { updatedAt: new Date() } },
      { ...opts, returnDocument: 'after', projection: { seqCounter: 1 } },
    );
    return res?.seqCounter ?? null;
  },

  setFields: (
    db: Db,
    id: ObjectId,
    fields: Partial<
      Pick<ProjectDoc, 'mainBranchId' | 'defaultCalendarKey' | 'name' | 'description'>
    >,
    opts: Opts = {},
  ) =>
    col(db, 'projects').updateOne(
      { _id: id },
      { $set: { ...fields, updatedAt: new Date() } },
      opts,
    ),
};

// ---------- branches ----------

export const branches = {
  async insert(db: Db, doc: NewDoc<BranchDoc>, opts: Opts = {}): Promise<BranchDoc> {
    const full = stamp<BranchDoc>(doc);
    await col(db, 'branches').insertOne(full, opts);
    return full;
  },
  find: (db: Db, projectId: ObjectId, branchId: ObjectId, opts: Opts = {}) =>
    col(db, 'branches').findOne({ _id: branchId, projectId }, opts),
  findMain: (db: Db, projectId: ObjectId) =>
    col(db, 'branches').findOne({ projectId, kind: 'main' }),
  setHeadSeq: (db: Db, branchId: ObjectId, headSeq: number, opts: Opts = {}) =>
    col(db, 'branches').updateOne(
      { _id: branchId },
      { $set: { headSeq, updatedAt: new Date() } },
      opts,
    ),
};

// ---------- commits ----------

export const commits = {
  async insert(db: Db, doc: NewDoc<CommitDoc>, opts: Opts = {}): Promise<CommitDoc> {
    const full = stamp<CommitDoc>(doc);
    await col(db, 'commits').insertOne(full, opts);
    return full;
  },
  list: (db: Db, projectId: ObjectId, branchId: ObjectId) =>
    col(db, 'commits').find({ projectId, branchId }).sort({ seq: 1 }).toArray(),
  /** Commit counts keyed by project id string. */
  async countByProject(db: Db, projectIds: ObjectId[]): Promise<Map<string, number>> {
    const rows = await col(db, 'commits')
      .aggregate<{ _id: ObjectId; n: number }>([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: '$projectId', n: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(rows.map((r) => [r._id.toHexString(), r.n]));
  },
};

// ---------- jobs ----------

export const jobs = {
  async enqueue(
    db: Db,
    p: {
      projectId: ObjectId;
      branchId: ObjectId;
      type: JobType;
      input?: Record<string, unknown>;
      runAfter?: Date;
    },
  ): Promise<JobDoc> {
    const full = stamp<JobDoc>({
      projectId: p.projectId,
      branchId: p.branchId,
      type: p.type,
      status: 'queued',
      attempts: 0,
      lockedBy: null,
      lockedUntil: null,
      runAfter: p.runAfter ?? new Date(),
      progress: { done: 0, total: 0 },
      input: p.input ?? {},
      output: {},
      costMicros: 0,
      error: null,
    });
    await col(db, 'jobs').insertOne(full);
    return full;
  },
  findById: (db: Db, id: ObjectId) => col(db, 'jobs').findOne({ _id: id }),
};
