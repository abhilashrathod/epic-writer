import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import {
  branches,
  commits,
  isVersionedCollection,
  projects,
  readHeadByKey,
  type AuthorKind,
  type CommitStats,
  type VersionedCollection,
  type VersionedEnvelope,
} from '@epic/db';
import { Forbidden, Invalid, NotFound, Conflict } from './errors';

export type Change =
  | { op: 'create'; collection: VersionedCollection; key?: string; data: object }
  | { op: 'update'; collection: VersionedCollection; key: string; data: object }
  | { op: 'delete'; collection: VersionedCollection; key: string };

export interface CommitInput {
  projectId: ObjectId;
  branchId: ObjectId;
  message: string;
  author: { kind: AuthorKind; userId?: ObjectId; proposalId?: ObjectId };
  auto?: boolean;
  changes: Change[];
}

export interface CommitResult {
  seq: number;
  keys: string[];
}

const ENVELOPE_KEYS: readonly (keyof VersionedEnvelope)[] = [
  '_id',
  'key',
  'projectId',
  'branchId',
  'seq',
  'supersededSeq',
  'isHead',
  'deleted',
  'createdAt',
];

const STAT_GROUPS = new Set<string>(['entities', 'links', 'facts', 'documents']);

/** The only write path for versioned collections: one transaction, one seq, one commits row. */
export async function commit(db: Db, input: CommitInput): Promise<CommitResult> {
  validate(input);
  const session = db.client.startSession();
  try {
    // withTransaction retries the whole callback on TransientTransactionError
    // (e.g. two commits racing on projects.seqCounter) and on unknown commit results.
    return await session.withTransaction(() => commitInSession(db, session, input));
  } finally {
    await session.endSession();
  }
}

/** Runs a commit inside a caller-owned transaction. Callers must have started one. */
export async function commitInSession(
  db: Db,
  session: ClientSession,
  input: CommitInput,
): Promise<CommitResult> {
  validate(input);
  const { projectId, branchId } = input;
  const scope = { projectId, branchId };

  const branch = await branches.find(db, projectId, branchId, { session });
  if (!branch) throw new NotFound(`Branch ${branchId.toHexString()} not found in this project`);
  if (branch.readOnly) throw new Forbidden(`Branch "${branch.name}" is read-only`);

  const seq = await projects.nextSeq(db, projectId, { session });
  if (seq === null) throw new NotFound(`Project ${projectId.toHexString()} not found`);

  const now = new Date();
  const stats: CommitStats = { entities: 0, links: 0, facts: 0, documents: 0, other: 0 };
  const keys: string[] = [];

  for (const change of input.changes) {
    const coll = db.collection<VersionedEnvelope>(change.collection);
    let key: string;
    let body: object;

    if (change.op === 'create') {
      key = change.key ?? uuidv7();
      if (change.key) {
        const existing = await readHeadByKey(db, change.collection, scope, key, {
          includeDeleted: true,
          session,
        });
        if (existing) throw new Conflict(`${change.collection} key ${key} already exists`);
      }
      body = change.data;
    } else {
      key = change.key;
      const head = await readHeadByKey(db, change.collection, scope, key, { session });
      if (!head) throw new NotFound(`${change.collection} key ${key} not found`);
      await coll.updateOne(
        { _id: head._id, isHead: true },
        { $set: { isHead: false, supersededSeq: seq } },
        { session },
      );
      body = change.op === 'update' ? change.data : versionBody(head);
    }

    await coll.insertOne(
      {
        ...body,
        _id: new ObjectId(),
        key,
        projectId,
        branchId,
        seq,
        supersededSeq: null,
        isHead: true,
        deleted: change.op === 'delete',
        createdAt: now,
      },
      { session },
    );

    const group = STAT_GROUPS.has(change.collection) ? change.collection : 'other';
    stats[group as keyof CommitStats] += 1;
    keys.push(key);
  }

  await commits.insert(
    db,
    {
      projectId,
      branchId,
      seq,
      parentSeqs: branch.headSeq > 0 ? [branch.headSeq] : [],
      message: input.message,
      author: input.author,
      auto: input.auto ?? false,
      stats,
    },
    { session },
  );
  await branches.setHeadSeq(db, branchId, seq, { session });

  return { seq, keys };
}

function validate(input: CommitInput): void {
  if (!input.message.trim()) throw new Invalid('Commit message is empty');
  if (input.changes.length === 0) throw new Invalid('Commit has no changes');
  const seen = new Set<string>();
  for (const c of input.changes) {
    if (!isVersionedCollection(c.collection)) {
      throw new Invalid(`${String(c.collection)} is not a versioned collection`);
    }
    // Two versions of one key in one commit would share a seq and break the version index.
    if (c.key) {
      const id = `${c.collection}:${c.key}`;
      if (seen.has(id)) throw new Invalid(`${id} appears twice in one commit`);
      seen.add(id);
    }
    if (c.op !== 'delete') {
      const bad = ENVELOPE_KEYS.filter((k) => k in c.data);
      if (bad.length)
        throw new Invalid(`Change data must not set envelope fields: ${bad.join(', ')}`);
    }
  }
}

/** A version's body without its envelope: the `data` an update change starts from. */
export function versionBody<T extends VersionedEnvelope>(doc: T): Omit<T, keyof VersionedEnvelope> {
  const body = { ...doc } as Record<string, unknown>;
  for (const k of ENVELOPE_KEYS) delete body[k];
  return body as Omit<T, keyof VersionedEnvelope>;
}
