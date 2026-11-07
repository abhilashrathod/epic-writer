import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { branches, commits, readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject, DEFAULT_CALENDAR } from './create-project';
import { Invalid } from './errors';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());

describe('createProject', () => {
  it('creates the project, a main branch and the default calendar as commit 1', async () => {
    const ownerId = new ObjectId();
    const project = await createProject(db, { ownerId, name: ' Test World ', templateKey: 'blank' });
    expect(project).toMatchObject({
      name: 'Test World',
      ownerId,
      seqCounter: 1,
      templateKey: 'blank',
    });

    const main = await branches.findMain(db, project._id);
    expect(main).toMatchObject({
      _id: project.mainBranchId,
      name: 'main',
      headSeq: 1,
      readOnly: false,
    });

    const scope = { projectId: project._id, branchId: project.mainBranchId };
    const [calendar, ...rest] = await readHeads(db, 'calendars', scope);
    expect(rest).toHaveLength(0);
    expect(calendar).toMatchObject({
      ...DEFAULT_CALENDAR,
      key: project.defaultCalendarKey,
      seq: 1,
    });
    expect(calendar?.months).toHaveLength(12);

    const [c] = await commits.list(db, project._id, project.mainBranchId);
    expect(c).toMatchObject({
      seq: 1,
      message: 'Create project',
      author: { kind: 'user', userId: ownerId },
    });
  });

  it('rejects an empty name', async () => {
    await expect(
      createProject(db, { ownerId: new ObjectId(), name: '   ', templateKey: 'blank' }),
    ).rejects.toBeInstanceOf(Invalid);
  });
});
