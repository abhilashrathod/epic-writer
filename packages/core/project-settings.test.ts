import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { projects } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { assetViewUrl, finishImageUpload, requireImageAssets, startImageUpload } from './assets';
import { createCalendar, deleteCalendar, listCalendars, updateCalendar } from './calendars';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { Conflict, Invalid, NotFound } from './errors';
import { listProjects } from './list-projects';
import {
  convertUnits,
  projectSettings,
  renameProject,
  setDefaultCalendar,
  setInspirations,
  setOverview,
  setProjectArchived,
  setUnits,
  setVisual,
} from './project-settings';
import { diskStorage, r2Storage } from './storage';
import { openProject, type ProjectContext } from './works';
import { emptyOverview } from './defaults';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let userId: ObjectId;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, userId);
});
const reload = async () => (ctx = await openProject(db, ctx.project._id, userId));

describe('project settings', () => {
  it('renames, archives and restores', async () => {
    await renameProject(db, ctx, '  Aryan Tales ');
    await setProjectArchived(db, ctx, true);
    expect(await listProjects(db, userId)).toEqual([
      expect.objectContaining({ name: 'Aryan Tales', archived: true }),
    ]);
    await reload();
    await setProjectArchived(db, ctx, false);
    expect((await listProjects(db, userId))[0]!.archived).toBe(false);
    await expect(renameProject(db, ctx, ' ')).rejects.toBeInstanceOf(Invalid);
  });

  it('stores the overview with themes from the codex, and inspirations', async () => {
    const T = (await listEntityTypes(db, ctx))[0]!.key;
    const theme = await createEntity(db, ctx, { typeKey: T, name: 'Duty' });
    await setOverview(db, ctx, {
      ...emptyOverview(),
      logline: 'A vow.',
      themeKeys: [theme, theme],
    });
    await setInspirations(db, ctx, [
      { title: 'The Iliad', kind: 'myth', creator: 'Homer', note: '', url: '' },
    ]);
    await reload();
    expect(projectSettings(ctx)).toMatchObject({
      overview: { logline: 'A vow.', themeKeys: [theme] },
      inspirations: [{ title: 'The Iliad' }],
      archived: false,
    });
    await expect(
      setOverview(db, ctx, { ...emptyOverview(), themeKeys: ['missing'] }),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it('edits units, converts, and keeps units that are in use', async () => {
    const units = [
      { key: 'krosha', name: 'Krosha', abbr: 'kr', toBase: 3000 },
      { key: 'yojana', name: 'Yojana', abbr: 'yj', toBase: 12000 },
    ];
    await setUnits(db, ctx, units);
    expect(convertUnits(units, 2, 'yojana', 'krosha')).toBe(8);
    expect(() => convertUnits(units, 1, 'yojana', 'mile')).toThrow(Invalid);
    await expect(setUnits(db, ctx, [units[0]!, units[0]!])).rejects.toBeInstanceOf(Invalid);

    const types = await listEntityTypes(db, ctx);
    const withQty = types.find((t) => t.fields.some((f) => f.kind === 'quantity'));
    if (withQty) {
      const f = withQty.fields.find((x) => x.kind === 'quantity')!;
      await createEntity(db, ctx, {
        typeKey: withQty.key,
        name: 'Road',
        fields: { [f.key]: { value: 3, unitKey: 'yojana' } },
      });
      await reload();
      await expect(setUnits(db, ctx, [units[0]!])).rejects.toBeInstanceOf(Conflict);
    }
  });
});

describe('calendars', () => {
  const cal = {
    name: 'Steward Reckoning',
    epochOffset: 100,
    months: [{ name: 'One', days: 30 }],
    daysPerWeek: 7,
    weekdayNames: [],
    eras: [{ name: 'Steward', abbr: 'SR', startDay: 0, direction: 1 as const }],
    displayFormat: '{day} {month} {year} {era}',
  };

  it('creates, edits, makes default and deletes calendars', async () => {
    const key = await createCalendar(db, ctx, cal);
    await updateCalendar(db, ctx, key, { ...cal, name: 'New Reckoning' });
    expect((await listCalendars(db, ctx)).map((c) => c.name)).toContain('New Reckoning');
    await expect(createCalendar(db, ctx, { ...cal, months: [] })).rejects.toBeInstanceOf(Invalid);
    await expect(createCalendar(db, ctx, { ...cal, weekdayNames: ['Mon'] })).rejects.toBeInstanceOf(
      Invalid,
    );

    await setDefaultCalendar(db, ctx, key);
    await reload();
    expect((await listCalendars(db, ctx))[0]!.key).toBe(key);
    await expect(deleteCalendar(db, ctx, key)).rejects.toBeInstanceOf(Invalid);
    await expect(setDefaultCalendar(db, ctx, 'nope')).rejects.toBeInstanceOf(Invalid);

    const other = await createCalendar(db, ctx, cal);
    await deleteCalendar(db, ctx, other);
    await expect(updateCalendar(db, ctx, other, cal)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('image uploads', () => {
  it('signs an upload, records the asset, and serves it', async () => {
    const storage = diskStorage(await mkdtemp(join(tmpdir(), 'ew-')), '/files');
    await expect(
      startImageUpload(storage, ctx, { mime: 'text/plain', size: 1 }),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      startImageUpload(storage, ctx, { mime: 'image/png', size: 20_000_000 }),
    ).rejects.toBeInstanceOf(Invalid);

    const { storageKey, uploadUrl } = await startImageUpload(storage, ctx, {
      mime: 'image/png',
      size: 4,
    });
    expect(uploadUrl).toBe(`/files/${storageKey}`);
    const finish = () => finishImageUpload(db, storage, ctx, { storageKey, width: 2, height: 2 });
    await expect(finish()).rejects.toBeInstanceOf(NotFound);
    await storage.write(storageKey, 'image/png', new Uint8Array([1, 2, 3, 4]));
    const asset = await finish();
    expect(asset).toMatchObject({ kind: 'image', size: 4, mime: 'image/png' });
    expect((await finish())._id.equals(asset._id)).toBe(true);
    await expect(
      finishImageUpload(db, storage, ctx, { storageKey: 'projects/other/x', width: 1, height: 1 }),
    ).rejects.toBeInstanceOf(Invalid);

    const id = asset._id.toHexString();
    expect(await assetViewUrl(db, storage, ctx, id)).toBe(`/files/${storageKey}`);
    await expect(assetViewUrl(db, storage, ctx, 'bad')).rejects.toBeInstanceOf(NotFound);
    expect(await requireImageAssets(db, ctx, [id, id])).toHaveLength(1);
    await expect(
      requireImageAssets(db, ctx, [new ObjectId().toHexString()]),
    ).rejects.toBeInstanceOf(Invalid);

    await setVisual(db, ctx, {
      palette: ['#a83232'],
      moodKeywords: ['dusk'],
      moodboardAssetIds: [id],
    });
    const p = await projects.findById(db, ctx.project._id);
    expect(p!.visual.moodboardAssetIds[0]!.equals(asset._id)).toBe(true);
  });

  it('presigns R2 URLs with an expiry and signature', async () => {
    const r2 = r2Storage({
      accountId: 'acct',
      accessKeyId: 'FAKEKEYID',
      secretAccessKey: 'fake-secret-for-tests',
      bucket: 'bkt',
    });
    const put = new URL(await r2.uploadUrl('projects/p/k', 'image/png'));
    expect(put.host).toBe('acct.r2.cloudflarestorage.com');
    expect(put.pathname).toBe('/bkt/projects/p/k');
    expect(put.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(put.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(new URL(await r2.viewUrl('projects/p/k')).searchParams.get('X-Amz-Expires')).toBe(
      '3600',
    );
  });
});
