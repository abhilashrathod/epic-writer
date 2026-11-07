import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { commits, readHeadByKey } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { firstPresence } from './first-appearances';
import { saveWorkingText } from './save';
import { createDocument, createWork, openProject, type ProjectContext } from './works';

const SCRIPT = (e: string) =>
  [
    'INT. HALL - DAY [[@s:a]]',
    '',
    '[[@e:x|BHISHMA]]',
    `Where is [[@e:${e}|Ganga]]?`,
    '',
    'EXT. RIVER - DAWN [[@s:b]]',
    '',
    `[[@e:${e}|Ganga]] rises from the water.`,
  ].join('\n');

describe('firstPresence', () => {
  const doc = { key: 'd1', workKey: 'w1', orderPath: '0001.0002', format: 'fountain' as const };

  it('skips dialogue mentions and keeps the earliest scene', () => {
    const found = firstPresence(doc, SCRIPT('g'));
    expect(found.get('x')).toEqual({
      workKey: 'w1',
      documentKey: 'd1',
      sceneKey: 'a',
      order: '0001.0002.0001',
    });
    expect(found.get('g')).toMatchObject({ sceneKey: 'b', order: '0001.0002.0002' });
  });

  it('counts every mention in prose', () => {
    const prose = '<!-- s:a -->\n# One\n\n"Where is [[@e:g|Ganga]]?" he asked.';
    expect(firstPresence({ ...doc, format: 'markdown' }, prose).get('g')).toMatchObject({
      sceneKey: 'a',
    });
  });
});

describe('updateFirstAppearances (on save)', () => {
  let db: Db;
  let drop: () => Promise<void>;
  let ctx: ProjectContext;
  let ep1: string;
  let ep2: string;
  let ganga: string;
  const versions = new Map<string, number>();

  beforeAll(async () => ({ db, drop } = await createTestDb()));
  afterAll(() => drop());
  beforeEach(async () => {
    const userId = new ObjectId();
    const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
    ctx = await openProject(db, p._id, userId);
    const T = Object.fromEntries((await listEntityTypes(db, ctx)).map((t) => [t.name, t.key]));
    ganga = await createEntity(db, ctx, { typeKey: T.Character, name: 'Ganga' });
    const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
    const season = await createDocument(db, ctx, { workKey, parentKey: null });
    ep1 = await createDocument(db, ctx, { workKey, parentKey: season });
    ep2 = await createDocument(db, ctx, { workKey, parentKey: season });
    versions.clear();
  });

  const save = async (documentKey: string, text: string) => {
    const { version } = await saveWorkingText(db, ctx, {
      documentKey,
      text,
      baseVersion: versions.get(documentKey) ?? 0,
    });
    versions.set(documentKey, version);
  };
  const first = async () =>
    (await readHeadByKey(db, 'entities', ctx.scope, ganga))!.firstAppearances;

  it('records, moves earlier, falls back to a later episode and clears', async () => {
    await save(ep2, `INT. CAVE [[@s:c]]\n\n[[@e:${ganga}|Ganga]] waits.`);
    expect(await first()).toEqual([expect.objectContaining({ documentKey: ep2, sceneKey: 'c' })]);

    await save(ep1, SCRIPT(ganga));
    expect(await first()).toEqual([expect.objectContaining({ documentKey: ep1, sceneKey: 'b' })]);

    const seqs = (await commits.list(db, ctx.project._id, ctx.scope.branchId)).length;
    await save(ep1, `${SCRIPT(ganga)}\n\nMore mist.`);
    expect((await commits.list(db, ctx.project._id, ctx.scope.branchId)).length).toBe(seqs);

    await save(ep1, 'INT. HALL - DAY [[@s:a]]\n\nEmpty.');
    expect(await first()).toEqual([expect.objectContaining({ documentKey: ep2, sceneKey: 'c' })]);

    await save(ep2, 'INT. CAVE [[@s:c]]\n\nNobody.');
    expect(await first()).toEqual([]);
    const last = (await commits.list(db, ctx.project._id, ctx.scope.branchId)).at(-1)!;
    expect(last).toMatchObject({ auto: true, message: 'Update first appearances' });
  });
});
