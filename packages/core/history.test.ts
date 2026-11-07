import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeadByKey } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { createEntity, deleteEntity, updateEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { Conflict, NotFound } from './errors';
import { getCommit, listCommits, undoCommit } from './history';
import { openProject, type ProjectContext } from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let character: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, userId);
  character = (await listEntityTypes(db, ctx)).find((t) => t.name === 'Character')!.key;
});

const head = (key: string) => readHeadByKey(db, 'entities', ctx.scope, key);
const lastSeq = async () => (await listCommits(db, ctx, { limit: 1 }))[0]!.seq;

describe('listCommits and getCommit', () => {
  it('pages newest first and lists what a commit changed', async () => {
    const key = await createEntity(db, ctx, { typeKey: character, name: 'Ganga' });
    await updateEntity(db, ctx, key, { typeKey: character, name: 'Ganga Devi' });
    const [latest, previous] = await listCommits(db, ctx, { limit: 2 });
    expect(latest!.seq).toBe(previous!.seq + 1);
    expect(latest).toMatchObject({ author: { kind: 'user' }, auto: false });
    expect((await listCommits(db, ctx, { before: latest!.seq, limit: 1 }))[0]!.seq).toBe(
      previous!.seq,
    );

    expect((await getCommit(db, ctx, latest!.seq)).changes).toEqual([
      { collection: 'entities', key, op: 'update', label: 'Ganga Devi' },
    ]);
    expect((await getCommit(db, ctx, previous!.seq)).changes[0]).toMatchObject({ op: 'create' });
    await expect(getCommit(db, ctx, 9999)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('undoCommit', () => {
  it('undoes an update, a delete and a create with new commits', async () => {
    const key = await createEntity(db, ctx, { typeKey: character, name: 'Ganga' });
    const created = await lastSeq();
    await updateEntity(db, ctx, key, { typeKey: character, name: 'Ganga Devi' });
    await undoCommit(db, ctx, await lastSeq());
    expect(await head(key)).toMatchObject({ name: 'Ganga' });
    expect((await listCommits(db, ctx, { limit: 1 }))[0]!.message).toBe('Undo "Edit "Ganga Devi""');

    await deleteEntity(db, ctx, key);
    const deleted = await lastSeq();
    await undoCommit(db, ctx, deleted);
    expect(await head(key)).toMatchObject({ name: 'Ganga', deleted: false });

    // The create was followed by later changes to the same entry.
    await expect(undoCommit(db, ctx, created)).rejects.toBeInstanceOf(Conflict);
    // Undoing an undo works like any other commit.
    await undoCommit(db, ctx, await lastSeq());
    expect(await head(key)).toBeNull();
  });

  it('deletes what a commit created', async () => {
    const key = await createEntity(db, ctx, { typeKey: character, name: 'Shantanu' });
    await undoCommit(db, ctx, await lastSeq());
    expect(await head(key)).toBeNull();
    expect((await getCommit(db, ctx, await lastSeq())).changes).toEqual([
      { collection: 'entities', key, op: 'delete', label: 'Shantanu' },
    ]);
  });

  it('refuses to bring back a name another entry now uses', async () => {
    const key = await createEntity(db, ctx, { typeKey: character, name: 'Satyavati' });
    await deleteEntity(db, ctx, key);
    const deleted = await lastSeq();
    await createEntity(db, ctx, { typeKey: character, name: 'Satyavati' });
    await expect(undoCommit(db, ctx, deleted)).rejects.toBeInstanceOf(Conflict);
  });
});
