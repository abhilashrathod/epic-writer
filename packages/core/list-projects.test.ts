import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createTestDb } from '@epic/db/testing';
import { commit } from './commit';
import { createProject } from './create-project';
import { listProjects } from './list-projects';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());

describe('listProjects', () => {
  it("lists only the user's projects, newest first, with commit counts", async () => {
    const me = new ObjectId();
    const a = await createProject(db, { ownerId: me, name: 'First', templateKey: 'blank' });
    const b = await createProject(db, { ownerId: me, name: 'Second', templateKey: 'blank' });
    await createProject(db, { ownerId: new ObjectId(), name: 'Not mine', templateKey: 'blank' });
    await commit(db, {
      projectId: b._id,
      branchId: b.mainBranchId,
      message: 'add',
      author: { kind: 'user', userId: me },
      changes: [{ op: 'create', collection: 'storylines', data: { name: 'Main' } }],
    });

    const list = await listProjects(db, me);
    expect(list.map((p) => [p.name, p.commitCount])).toEqual([
      ['Second', 2],
      ['First', 1],
    ]);
    expect(list[1]?.id).toBe(a._id.toHexString());
  });
});
