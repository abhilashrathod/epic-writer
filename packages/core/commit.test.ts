import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  branches,
  col,
  commits,
  projects,
  readAtSeq,
  readHeadByKey,
  readHeads,
  type BranchScope,
} from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { commit, type Change, type CommitInput } from './commit';
import { Conflict, Forbidden, Invalid, NotFound } from './errors';

let db: Db;
let drop: () => Promise<void>;
let scope: BranchScope;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());

// A bare project with seqCounter 0, so the first commit in each test is seq 1.
beforeEach(async () => {
  const projectId = new ObjectId();
  const branchId = new ObjectId();
  await projects.insert(db, { _id: projectId, seqCounter: 0, mainBranchId: branchId } as never);
  await branches.insert(db, {
    _id: branchId,
    projectId,
    name: 'main',
    kind: 'main',
    parentBranchId: null,
    forkSeq: null,
    headSeq: 0,
    readOnly: false,
    status: 'active',
  });
  scope = { projectId, branchId };
});

const author = { kind: 'user' as const, userId: new ObjectId() };
const run = (changes: Change[], extra: Partial<CommitInput> = {}) =>
  commit(db, { ...scope, message: 'test', author, changes, ...extra });
const createEntity = (name: string, key?: string): Change => ({
  op: 'create',
  collection: 'entities',
  ...(key ? { key } : {}),
  data: { name, slug: name.toLowerCase() },
});

describe('commit', () => {
  it('create inserts one head at seq 1 with a UUID v7 key', async () => {
    const { seq, keys } = await run([createEntity('Arjuna')]);
    expect(seq).toBe(1);
    const rows = await col(db, 'entities').find({ projectId: scope.projectId }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: keys[0],
      seq: 1,
      isHead: true,
      deleted: false,
      supersededSeq: null,
    });
    expect(keys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it('update closes the old head and inserts a new head with the same key', async () => {
    const {
      keys: [key],
    } = await run([createEntity('Arjuna')]);
    const { seq } = await run([
      { op: 'update', collection: 'entities', key: key!, data: { name: 'Partha', slug: 'partha' } },
    ]);
    expect(seq).toBe(2);
    const rows = await col(db, 'entities')
      .find({ projectId: scope.projectId, key })
      .sort({ seq: 1 })
      .toArray();
    expect(rows.map((r) => [r.seq, r.isHead, r.supersededSeq, r.name])).toEqual([
      [1, false, 2, 'Arjuna'],
      [2, true, null, 'Partha'],
    ]);
  });

  it('update keeping the same slug passes the unique slug index', async () => {
    const {
      keys: [key],
    } = await run([createEntity('Arjuna')]);
    await run([
      {
        op: 'update',
        collection: 'entities',
        key: key!,
        data: { name: 'Arjuna', slug: 'arjuna', summary: 'archer' },
      },
    ]);
    expect((await readHeadByKey(db, 'entities', scope, key!))?.summary).toBe('archer');
  });

  it('delete writes a tombstone head carrying the last body', async () => {
    const {
      keys: [key],
    } = await run([createEntity('Karna')]);
    await run([{ op: 'delete', collection: 'entities', key: key! }]);
    const head = await readHeadByKey(db, 'entities', scope, key!, { includeDeleted: true });
    expect(head).toMatchObject({ deleted: true, isHead: true, seq: 2, name: 'Karna' });
    expect(await readHeads(db, 'entities', scope)).toHaveLength(0);
    expect(await readHeadByKey(db, 'entities', scope, key!)).toBeNull();
    expect((await readAtSeq(db, 'entities', scope, 1)).map((e) => e.name)).toEqual(['Karna']);
  });

  it('writes a commits row with stats and moves the branch head', async () => {
    await run([createEntity('A')]);
    await run([
      createEntity('B'),
      { op: 'create', collection: 'links', data: {} },
      { op: 'create', collection: 'calendars', data: {} },
    ]);
    const rows = await commits.list(db, scope.projectId, scope.branchId);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
    expect(rows[1]).toMatchObject({
      parentSeqs: [1],
      auto: false,
      stats: { entities: 1, links: 1, facts: 0, documents: 0, other: 1 },
    });
    expect((await branches.find(db, scope.projectId, scope.branchId))?.headSeq).toBe(2);
  });

  it.each([
    ['update', { op: 'update', collection: 'entities', key: 'missing', data: { name: 'x' } }],
    ['delete', { op: 'delete', collection: 'entities', key: 'missing' }],
  ] as const)('%s of a missing key throws NotFound and writes nothing', async (_op, bad) => {
    await expect(run([createEntity('Bhima'), bad])).rejects.toBeInstanceOf(NotFound);
    expect(await col(db, 'entities').countDocuments({ projectId: scope.projectId })).toBe(0);
    expect(await col(db, 'commits').countDocuments({ projectId: scope.projectId })).toBe(0);
    expect((await projects.findById(db, scope.projectId))?.seqCounter).toBe(0);
    expect((await branches.find(db, scope.projectId, scope.branchId))?.headSeq).toBe(0);
  });

  it('updating or deleting a tombstone throws NotFound', async () => {
    const {
      keys: [key],
    } = await run([createEntity('Drona')]);
    await run([{ op: 'delete', collection: 'entities', key: key! }]);
    await expect(run([{ op: 'delete', collection: 'entities', key: key! }])).rejects.toBeInstanceOf(
      NotFound,
    );
    await expect(
      run([{ op: 'update', collection: 'entities', key: key!, data: { name: 'x' } }]),
    ).rejects.toBeInstanceOf(NotFound);
  });

  it('20 concurrent commits get distinct, gap-free seqs with matching commits rows', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => run([createEntity(`E${i}`)], { message: `c${i}` })),
    );
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const rows = await commits.list(db, scope.projectId, scope.branchId);
    expect(rows.map((r) => r.seq)).toEqual(seqs);
    for (const r of results) {
      const e = await readHeadByKey(db, 'entities', scope, r.keys[0]!);
      expect(e?.seq).toBe(r.seq);
    }
    expect((await projects.findById(db, scope.projectId))?.seqCounter).toBe(20);
    expect((await branches.find(db, scope.projectId, scope.branchId))?.headSeq).toBe(20);
  });

  it('readAtSeq returns exactly the versions live at each seq', async () => {
    const names = async (s: number) =>
      (await readAtSeq(db, 'entities', scope, s)).map((e) => e.name).sort();
    const {
      keys: [a, b],
    } = await run([createEntity('A1'), createEntity('B1')]); // 1
    await run([
      { op: 'update', collection: 'entities', key: a!, data: { name: 'A2', slug: 'a2' } },
    ]); // 2
    await run([{ op: 'delete', collection: 'entities', key: b! }, createEntity('C1')]); // 3
    await run([
      { op: 'update', collection: 'entities', key: a!, data: { name: 'A3', slug: 'a3' } },
    ]); // 4
    expect(await names(0)).toEqual([]);
    expect(await names(1)).toEqual(['A1', 'B1']);
    expect(await names(2)).toEqual(['A2', 'B1']);
    expect(await names(3)).toEqual(['A2', 'C1']);
    expect(await names(4)).toEqual(['A3', 'C1']);
    expect((await readHeads(db, 'entities', scope)).map((e) => e.name).sort()).toEqual([
      'A3',
      'C1',
    ]);
  });

  it('the version index rejects a duplicate (projectId, key, branchId, seq)', async () => {
    const {
      keys: [key],
    } = await run([createEntity('Dup')]);
    const head = await readHeadByKey(db, 'entities', scope, key!);
    await expect(
      col(db, 'entities').insertOne({ ...head!, _id: new ObjectId() }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('create with an existing key throws Conflict', async () => {
    const key = '0190a3b4-0000-7000-8000-000000000001';
    await run([createEntity('A', key)]);
    await expect(run([createEntity('B', key)])).rejects.toBeInstanceOf(Conflict);
  });

  it('rejects invalid input before touching the database', async () => {
    await expect(run([])).rejects.toBeInstanceOf(Invalid);
    await expect(run([createEntity('A')], { message: '  ' })).rejects.toBeInstanceOf(Invalid);
    await expect(
      run([{ op: 'create', collection: 'users' as never, data: {} }]),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      run([{ op: 'create', collection: 'entities', data: { seq: 99 } }]),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      run([
        { op: 'update', collection: 'entities', key: 'k', data: {} },
        { op: 'delete', collection: 'entities', key: 'k' },
      ]),
    ).rejects.toBeInstanceOf(Invalid);
    expect((await projects.findById(db, scope.projectId))?.seqCounter).toBe(0);
  });

  it('throws NotFound for an unknown branch and Forbidden for a read-only one', async () => {
    await expect(run([createEntity('A')], { branchId: new ObjectId() })).rejects.toBeInstanceOf(
      NotFound,
    );
    await col(db, 'branches').updateOne({ _id: scope.branchId }, { $set: { readOnly: true } });
    await expect(run([createEntity('A')])).rejects.toBeInstanceOf(Forbidden);
  });
});
