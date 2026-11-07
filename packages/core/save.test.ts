import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { col, scenes } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { Conflict, Invalid, NotFound } from './errors';
import {
  CHECKPOINT_EVERY_MS,
  createSnapshot,
  getVersion,
  listVersions,
  restoreVersion,
  saveWorkingText,
} from './save';
import {
  createDocument,
  createWork,
  getWorkingText,
  openProject,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let episode: string;
let season: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  vi.useRealTimers();
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'Test World', templateKey: 'blank' });
  ctx = await openProject(db, p._id, userId);
  const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  season = await createDocument(db, ctx, { workKey, parentKey: null });
  episode = await createDocument(db, ctx, { workKey, parentKey: season });
});

const save = (text: string, baseVersion: number) =>
  saveWorkingText(db, ctx, { documentKey: episode, text, baseVersion });

const SCRIPT = [
  'INT. HALL - DAY [[@s:s1]]',
  '',
  '[[@e:e1|Bhishma]] waits for [[@e:e2|Ganga]].',
  '',
  '[[@e:e1|BHISHMA]]',
  'I vow it.',
  '',
  'EXT. RIVER - DAWN [[@s:s2]]',
  '',
  'Mist.',
  '',
  'EXT. UNKEYED',
].join('\n');

describe('saveWorkingText', () => {
  it('saves with optimistic versions and stores counts', async () => {
    expect(await save('INT. HALL [[@s:a]]\n\nOne two three.', 0)).toEqual({ version: 1 });
    expect(await save('INT. HALL [[@s:a]]\n\nOne two.', 1)).toEqual({ version: 2 });
    expect(await getWorkingText(db, ctx, episode)).toMatchObject({
      text: 'INT. HALL [[@s:a]]\n\nOne two.',
      version: 2,
    });
    const row = await col(db, 'documentVersions').findOne({
      documentKey: episode,
      kind: 'working',
    });
    expect(row).toMatchObject({ wordCount: 4, pageCount: 1 });
    expect(row?.textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a stale base version with the current server text, and writes nothing', async () => {
    await save('mine', 0);
    const err = await save('theirs', 0).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Conflict);
    expect((err as Conflict).details).toEqual({ current: { text: 'mine', version: 1 } });
    expect(await getWorkingText(db, ctx, episode)).toMatchObject({ text: 'mine', version: 1 });
  });

  it('derives scene rows with order, entities and speakers; skips unkeyed scenes', async () => {
    await save(SCRIPT, 0);
    const rows = await scenes.listForDocument(db, { ...ctx.scope, documentKey: episode });
    expect(rows.map((r) => [r.sceneKey, r.heading, r.order])).toEqual([
      ['s1', 'INT. HALL - DAY', '0001.0001.0001'],
      ['s2', 'EXT. RIVER - DAWN', '0001.0001.0002'],
    ]);
    expect(rows[0]).toMatchObject({ entityKeys: ['e1', 'e2'], speakingEntityKeys: ['e1'] });
    expect(rows[1]).toMatchObject({ entityKeys: [], speakingEntityKeys: [] });

    await save('INT. ONLY [[@s:s3]]', 1);
    expect(
      (await scenes.listForDocument(db, { ...ctx.scope, documentKey: episode })).map(
        (r) => r.sceneKey,
      ),
    ).toEqual(['s3']);
  });

  it('checkpoints on the first save, then at most every 10 minutes, and only when text changed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await save('a', 0);
    await save('b', 1);
    expect(await listVersions(db, ctx, episode)).toHaveLength(1);
    vi.setSystemTime(Date.now() + CHECKPOINT_EVERY_MS);
    await save('c', 2);
    const versions = await listVersions(db, ctx, episode);
    expect(versions.map((v) => [v.reason, v.version])).toEqual([
      ['autosave-checkpoint', 3],
      ['autosave-checkpoint', 1],
    ]);
    vi.setSystemTime(Date.now() + CHECKPOINT_EVERY_MS);
    await save('c', 3); // unchanged text: no new checkpoint
    expect(await listVersions(db, ctx, episode)).toHaveLength(2);
  });

  it('refuses containers and unknown documents', async () => {
    await expect(
      saveWorkingText(db, ctx, { documentKey: season, text: 'x', baseVersion: 0 }),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      saveWorkingText(db, ctx, { documentKey: 'nope', text: 'x', baseVersion: 0 }),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe('snapshots and restore', () => {
  it('names a snapshot of the working text, or of given text', async () => {
    await save('draft one', 0);
    const named = await createSnapshot(db, ctx, {
      documentKey: episode,
      label: ' Table read ',
      reason: 'manual',
    });
    expect(named).toMatchObject({
      label: 'Table read',
      reason: 'manual',
      version: 1,
      wordCount: 2,
    });
    const local = await createSnapshot(db, ctx, {
      documentKey: episode,
      label: 'Unsaved text from this device',
      reason: 'manual',
      text: 'local words here',
    });
    expect((await getVersion(db, ctx, episode, local.id)).text).toBe('local words here');
  });

  it('restores a version after snapshotting the current text, so restore can be undone', async () => {
    await save('first', 0);
    const first = await createSnapshot(db, ctx, {
      documentKey: episode,
      label: 'First',
      reason: 'manual',
    });
    await save('second', 1);
    expect(
      await restoreVersion(db, ctx, { documentKey: episode, versionId: first.id, baseVersion: 2 }),
    ).toEqual({ text: 'first', version: 3 });
    expect(await getWorkingText(db, ctx, episode)).toMatchObject({ text: 'first', version: 3 });
    const before = (await listVersions(db, ctx, episode)).find(
      (v) => v.label === 'Before restore',
    )!;
    expect((await getVersion(db, ctx, episode, before.id)).text).toBe('second');
  });

  it('rejects unknown version ids', async () => {
    await expect(getVersion(db, ctx, episode, 'bad')).rejects.toBeInstanceOf(NotFound);
    await expect(getVersion(db, ctx, episode, new ObjectId().toHexString())).rejects.toBeInstanceOf(
      NotFound,
    );
  });
});
