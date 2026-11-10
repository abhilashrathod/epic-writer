import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { narrativeOrder, readHeadByKey, readHeads, VERSIONED_COLLECTIONS } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { timedStatus } from './asof';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { createEntityType } from './entity-types';
import { addFact, listFacts, worldSnapshot } from './facts';
import { undoCommit } from './history';
import { exportProject, restoreProject } from './io';
import { loadNarrativeOrders } from './narrative-index';
import { saveWorkingText } from './save';
import {
  createDocument,
  createWork,
  moveDocument,
  openProject,
  type ProjectContext,
} from './works';

const scriptOf = (...keys: string[]) =>
  keys.map((k) => `INT. ROOM ${k.toUpperCase()} - DAY [[@s:${k}]]\n\nA line.`).join('\n\n');
const when = { start: 0, end: null, precision: 'unknown' as const };

describe('narrative positions', () => {
  let db: Db;
  let drop: () => Promise<void>;
  let ctx: ProjectContext;
  let ownerId: ObjectId;
  let workKey: string;
  let season: string;
  let typeKey: string;

  beforeAll(async () => {
    ({ db, drop } = await createTestDb());
    ownerId = new ObjectId();
    const p = await createProject(db, { ownerId, name: 'W', templateKey: 'blank' });
    ctx = await openProject(db, p._id, ownerId);
    workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
    season = await createDocument(db, ctx, { workKey, parentKey: null });
    typeKey = await createEntityType(db, ctx, {
      name: 'Marker',
      pluralName: 'Markers',
      group: ctx.project.typeGroups[0]!.key,
      traits: [],
      fields: [{ key: 'state', label: 'State', kind: 'text', timeVarying: true, ai: 'read' }],
    });
  }, 30_000);
  afterAll(() => drop());

  const episode = (title: string) => createDocument(db, ctx, { workKey, parentKey: season, title });
  const path = async (key: string) =>
    (await readHeadByKey(db, 'documents', ctx.scope, key))!.orderPath;
  const save = (documentKey: string, text: string, baseVersion: number) =>
    saveWorkingText(db, ctx, { documentKey, text, baseVersion });
  const positionOf = async (key: string) => (await loadNarrativeOrders(db, ctx)).get(key)?.order;
  const versionedRows = async () => {
    const counts = await Promise.all(
      [...VERSIONED_COLLECTIONS, 'commits'].map((c) =>
        db.collection(c).countDocuments({ projectId: ctx.scope.projectId }),
      ),
    );
    return counts.reduce((a, b) => a + b, 0);
  };
  const fact = async (entityKey: string, documentKey: string, sceneKey: string, order: string) =>
    addFact(db, ctx, {
      entityKey,
      field: 'state',
      value: 'changed',
      storyTime: when,
      narrativeRefs: [{ workKey, documentKey, sceneKey, order }],
    });

  it('adds a scene at the start with 200 facts after it: no versioned row, right "as of"', async () => {
    const ep = await episode('Crowded');
    const entry = await createEntity(db, ctx, { typeKey, name: 'Crowd' });
    const at = await path(ep);
    await save(
      ep,
      `INT. ROOM A - DAY [[@s:a]]\n\nA line.\n\nINT. ROOM B - DAY [[@s:b]]\n\n[[@e:${entry}|Crowd]] waits.`,
      0,
    );
    for (let i = 0; i < 200; i++) await fact(entry, ep, 'b', `${at}.0002`);
    const asOf = { storyTime: null, workKey, order: `${at}.0002` };
    const statuses = async () =>
      new Set((await worldSnapshot(db, ctx)).facts.map((f) => timedStatus(f, asOf)));
    expect(await statuses()).toEqual(new Set(['past']));
    expect(await positionOf('b')).toBe(`${at}.0002`);

    const rows = await versionedRows();
    await save(
      ep,
      `INT. ROOM Z - DAY [[@s:z]]\n\nNew.\n\nINT. ROOM A - DAY [[@s:a]]\n\nA line.\n\nINT. ROOM B - DAY [[@s:b]]\n\n[[@e:${entry}|Crowd]] waits.`,
      1,
    );

    expect(await versionedRows()).toBe(rows);
    expect(await positionOf('b')).toBe(`${at}.0003`);
    expect(await statuses()).toEqual(new Set(['future']));
    expect(
      new Set((await listFacts(db, ctx, entry)).map((f) => f.narrativeRefs[0]!.order)),
    ).toEqual(new Set([`${at}.0003`]));
    const stored = await readHeads(db, 'facts', ctx.scope, { entityKey: entry });
    expect(new Set(stored.map((f) => f.narrativeRefs[0]!.order))).toEqual(new Set([`${at}.0002`]));
    const first = (await worldSnapshot(db, ctx)).entities.find((e) => e.key === entry)!;
    expect(first.firstAppearances[0]!.order).toBe(`${at}.0003`);
  }, 60_000);

  it('still undoes an earlier unrelated commit after a reorder', async () => {
    const one = await episode('One');
    const two = await episode('Two');
    await save(two, scriptOf('two1'), 0);
    const entry = await createEntity(db, ctx, { typeKey, name: 'Undoable' });
    const key = await fact(entry, two, 'two1', `${await path(two)}.0001`);
    const seq = (await readHeadByKey(db, 'facts', ctx.scope, key))!.seq;
    const rows = await versionedRows();

    await moveDocument(db, ctx, two, 'up');

    expect(await versionedRows()).toBe(rows + 3); // two episode versions and one commit
    expect(await positionOf('two1')).toBe(`${await path(two)}.0001`);
    expect(await path(two)).not.toBe(await path(one));
    await undoCommit(db, ctx, seq);
    expect(await readHeadByKey(db, 'facts', ctx.scope, key)).toBeNull();
  }, 30_000);

  it('follows a reorder and its undo without a commit of its own', async () => {
    const one = await episode('Left');
    const two = await episode('Right');
    await save(two, scriptOf('r1'), 0);
    const before = await positionOf('r1');
    await moveDocument(db, ctx, two, 'up');
    expect(await positionOf('r1')).not.toBe(before);
    await undoCommit(db, ctx, (await readHeadByKey(db, 'documents', ctx.scope, two))!.seq);
    expect(await positionOf('r1')).toBe(before);
    expect(await positionOf(one)).toBe(await path(one));
  }, 30_000);

  it('moves a container to its last scene, and writes nothing on a save that moves no scene', async () => {
    const ep = await episode('Finale');
    await save(ep, scriptOf('f1', 'f2'), 0);
    expect(await positionOf(season)).toBe(`${await path(ep)}.0002`);
    const sync = narrativeOrder.sync;
    let wrote = -1;
    narrativeOrder.sync = async (...args) => (wrote = await sync(...args));
    try {
      await save(ep, `${scriptOf('f1', 'f2')}\n\nMore.`, 1);
      expect(wrote).toBe(-1);
      await save(ep, scriptOf('f1'), 2);
      expect(wrote).toBe(2); // the gone scene, and the season ending earlier
    } finally {
      narrativeOrder.sync = sync;
    }
    expect(await positionOf('f2')).toBeUndefined();
    expect(await positionOf(season)).toBe(`${await path(ep)}.0001`);
  }, 30_000);

  it('rebuilds positions on restore, from a backup that has none', async () => {
    const before = await loadNarrativeOrders(db, ctx);
    const backup = await exportProject(db, ctx);
    await restoreProject(
      db,
      { ...backup, collections: { ...backup.collections, narrativeOrder: [] } },
      { ownerId, replace: true },
    );
    expect(await loadNarrativeOrders(db, ctx)).toEqual(before);
  }, 30_000);
});
