import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { col } from './client';
import type {
  BranchDoc,
  CommitDoc,
  DocumentVersionDoc,
  JobDoc,
  JobType,
  ProjectDoc,
  SceneDoc,
  UserDoc,
} from './collections';

/**
 * Scope for system rows that belong to no project (worker heartbeats). The data model has no
 * status collection, so these live in `jobs` under this all-zero id.
 */
export const SYSTEM_PROJECT_ID = new ObjectId('000000000000000000000000');

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
    const upsert = () =>
      col(db, 'users').findOneAndUpdate(
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
    let res;
    try {
      res = await upsert();
    } catch (err) {
      // Two first requests can race to insert; the loser hits the unique index. By then the row
      // exists, so a retry simply updates it.
      if ((err as { code?: number }).code !== 11000) throw err;
      res = await upsert();
    }
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

// ---------- documentVersions ----------

export const documentVersions = {
  /** The empty working copy every text document starts with. */
  async createWorking(
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string },
    opts: Opts = {},
  ): Promise<DocumentVersionDoc> {
    const full = stamp<DocumentVersionDoc>({
      ...p,
      kind: 'working',
      version: 0,
      text: '',
      seq: null,
      reason: 'manual',
      label: '',
      textHash: '',
      wordCount: 0,
      pageCount: 0,
    });
    await col(db, 'documentVersions').insertOne(full, opts);
    return full;
  },
  findWorking: (
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string },
    opts: Opts = {},
  ) => col(db, 'documentVersions').findOne({ ...p, kind: 'working' }, opts),

  /**
   * Replaces the working text only if it is still at `baseVersion` (optimistic save). Returns the
   * updated row, or null when another save got there first.
   */
  saveWorking: (
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string; baseVersion: number },
    fields: { text: string; textHash: string; wordCount: number; pageCount: number },
    opts: Opts = {},
  ) =>
    col(db, 'documentVersions').findOneAndUpdate(
      {
        projectId: p.projectId,
        branchId: p.branchId,
        documentKey: p.documentKey,
        kind: 'working',
        version: p.baseVersion,
      },
      { $set: { ...fields, updatedAt: new Date() }, $inc: { version: 1 } },
      { ...opts, returnDocument: 'after' },
    ),

  async insertSnapshot(
    db: Db,
    doc: Omit<DocumentVersionDoc, '_id' | 'createdAt' | 'updatedAt' | 'kind'>,
    opts: Opts = {},
  ): Promise<DocumentVersionDoc> {
    const full = stamp<DocumentVersionDoc>({ ...doc, kind: 'snapshot' });
    await col(db, 'documentVersions').insertOne(full, opts);
    return full;
  },

  latestSnapshot: (
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string },
    opts: Opts = {},
  ) =>
    col(db, 'documentVersions').findOne(
      { ...p, kind: 'snapshot' },
      { ...opts, sort: { createdAt: -1 }, projection: { text: 0 } },
    ),

  /** Working copies whose text contains `needle` (e.g. a mention marker). */
  findWorkingContaining: (db: Db, p: { projectId: ObjectId; branchId: ObjectId; needle: string }) =>
    col(db, 'documentVersions')
      .find({
        projectId: p.projectId,
        branchId: p.branchId,
        kind: 'working',
        text: { $regex: p.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') },
      })
      .toArray(),

  /** Snapshots newest first, without their text. */
  listSnapshots: (db: Db, p: { projectId: ObjectId; branchId: ObjectId; documentKey: string }) =>
    col(db, 'documentVersions')
      .find({ ...p, kind: 'snapshot' }, { sort: { createdAt: -1 }, projection: { text: 0 } })
      .toArray(),

  findSnapshot: (
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string; id: ObjectId },
  ) =>
    col(db, 'documentVersions').findOne({
      _id: p.id,
      projectId: p.projectId,
      branchId: p.branchId,
      documentKey: p.documentKey,
      kind: 'snapshot',
    }),
};

// ---------- scenes ----------

export const scenes = {
  /** Scenes are derived on save: a document's rows are replaced wholesale. */
  async replaceForDocument(
    db: Db,
    p: { projectId: ObjectId; branchId: ObjectId; documentKey: string },
    rows: Omit<SceneDoc, '_id' | 'createdAt' | 'updatedAt'>[],
    opts: Opts = {},
  ): Promise<void> {
    await col(db, 'scenes').deleteMany(p, opts);
    if (rows.length)
      await col(db, 'scenes').insertMany(
        rows.map((r) => stamp<SceneDoc>(r)),
        opts,
      );
  },
  /** Scenes that mention an entry, in narrative order. */
  listForEntity: (db: Db, p: { projectId: ObjectId; branchId: ObjectId; entityKey: string }) =>
    col(db, 'scenes')
      .find({ projectId: p.projectId, branchId: p.branchId, entityKeys: p.entityKey })
      .sort({ order: 1 })
      .toArray(),
  listForDocument: (db: Db, p: { projectId: ObjectId; branchId: ObjectId; documentKey: string }) =>
    col(db, 'scenes').find(p).sort({ order: 1 }).toArray(),
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

  /**
   * Atomically claims the oldest runnable job: queued and due, or running with an expired lock
   * (its worker crashed). `attempts` counts runs started, so crash loops also hit the cap.
   */
  claimNext: (db: Db, p: { workerId: string; now: Date; lockMs: number; maxAttempts: number }) =>
    col(db, 'jobs').findOneAndUpdate(
      {
        $or: [
          { status: 'queued', runAfter: { $lte: p.now } },
          { status: 'running', lockedUntil: { $lt: p.now }, attempts: { $lt: p.maxAttempts } },
        ],
      },
      {
        $set: {
          status: 'running',
          lockedBy: p.workerId,
          lockedUntil: new Date(p.now.getTime() + p.lockMs),
          updatedAt: p.now,
        },
        $inc: { attempts: 1 },
      },
      { sort: { runAfter: 1 }, returnDocument: 'after' },
    ),

  /** Fails jobs whose worker died holding them on their last allowed attempt. */
  failAbandoned: (db: Db, p: { now: Date; maxAttempts: number }) =>
    col(db, 'jobs').updateMany(
      { status: 'running', lockedUntil: { $lt: p.now }, attempts: { $gte: p.maxAttempts } },
      {
        $set: {
          status: 'failed',
          error: 'Worker stopped while running this job on its last attempt',
          lockedBy: null,
          lockedUntil: null,
          updatedAt: p.now,
        },
      },
    ),

  // Finishing updates are guarded by lockedBy, so a worker whose lock expired and was
  // reclaimed elsewhere can't overwrite the new owner's result.
  complete: (db: Db, id: ObjectId, workerId: string, output: Record<string, unknown>) =>
    col(db, 'jobs').updateOne(
      { _id: id, status: 'running', lockedBy: workerId },
      {
        $set: {
          status: 'done',
          output,
          error: null,
          lockedBy: null,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      },
    ),

  /** Requeues at `retryAt`, or fails for good when `retryAt` is null. */
  fail: (db: Db, id: ObjectId, workerId: string, error: string, retryAt: Date | null) =>
    col(db, 'jobs').updateOne(
      { _id: id, status: 'running', lockedBy: workerId },
      {
        $set: {
          status: retryAt ? 'queued' : 'failed',
          ...(retryAt ? { runAfter: retryAt } : {}),
          error,
          lockedBy: null,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      },
    ),

  /** Records that a worker is alive. Stored as a jobs row under SYSTEM_PROJECT_ID; never queued. */
  heartbeat: (db: Db, workerId: string, at = new Date()) =>
    col(db, 'jobs').updateOne(
      { projectId: SYSTEM_PROJECT_ID, 'input.heartbeat': true, 'input.workerId': workerId },
      {
        $set: { updatedAt: at },
        $setOnInsert: {
          projectId: SYSTEM_PROJECT_ID,
          branchId: SYSTEM_PROJECT_ID,
          type: 'noop',
          status: 'done',
          attempts: 0,
          lockedBy: null,
          lockedUntil: null,
          runAfter: at,
          progress: { done: 0, total: 0 },
          input: { heartbeat: true, workerId },
          output: {},
          costMicros: 0,
          error: null,
          createdAt: at,
        },
      },
      { upsert: true },
    ),

  /** Most recent heartbeat from any worker, or null if none has run. */
  async lastHeartbeat(db: Db): Promise<Date | null> {
    const row = await col(db, 'jobs').findOne(
      { projectId: SYSTEM_PROJECT_ID, 'input.heartbeat': true },
      { sort: { updatedAt: -1 }, projection: { updatedAt: 1 } },
    );
    return row?.updatedAt ?? null;
  },
};
