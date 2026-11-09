import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BSON, ObjectId, type Db } from 'mongodb';
import { col, PROJECT_COLLECTIONS, scenes, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { Conflict, Invalid } from './errors';
import {
  BACKUP_FORMAT,
  exportDocumentText,
  exportProject,
  exportProjectJson,
  importFountain,
  normaliseText,
  parseBackup,
  restoreProject,
  safeFileName,
  type ProjectBackup,
} from './io';
import { saveWorkingText } from './save';
import {
  createDocument,
  createWork,
  getTree,
  getWorkingText,
  openProject,
  renameDocument,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let workKey: string;
let season: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const login = `u-${new ObjectId().toHexString()}`;
  const user = await users.upsertFromGithub(db, {
    githubLogin: login,
    email: `${login}@example.com`,
    name: 'Test Writer',
  });
  await users.setAiKeys(db, user._id, [
    {
      provider: 'anthropic',
      encryptedKey: 'SECRET-CIPHERTEXT',
      iv: 'iv',
      tag: 'tag',
      label: '',
      last4: 'abcd',
    },
  ]);
  const p = await createProject(db, {
    ownerId: user._id,
    name: 'Test World',
    templateKey: 'blank',
  });
  ctx = await openProject(db, p._id, user._id);
  workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  season = await createDocument(db, ctx, { workKey, parentKey: null });
});

const FILE = [
  'Title: **The Crossing**',
  'Author: A. Writer',
  '',
  'INT. HALL - DAY',
  '',
  'A guard waits.',
  '',
  'EXT. RIVER - DAWN',
  '',
  'Mist.',
].join('\r\n');

describe('normaliseText and safeFileName', () => {
  it('normalises BOM and line endings', () => {
    expect(normaliseText('\uFEFFa\r\nb\rc\n')).toBe('a\nb\nc\n');
  });
  it('removes characters file systems reject', () => {
    expect(safeFileName('Ep 1: "Fire/Ice"?')).toBe('Ep 1 Fire Ice');
    expect(safeFileName('///')).toBe('document');
  });
});

describe('importFountain', () => {
  it('creates a script titled from the title page, with keyed scenes', async () => {
    const key = await importFountain(db, ctx, {
      workKey,
      parentKey: season,
      fileName: 'crossing.fountain',
      text: FILE,
    });
    const { document, text, version } = await getWorkingText(db, ctx, key);
    expect(document).toMatchObject({ title: 'The Crossing', kind: 'text', parentKey: season });
    expect(version).toBe(1);
    expect(text).not.toContain('\r');
    expect(text).not.toContain('Author:');
    expect(text).toMatch(/^INT\. HALL - DAY \[\[@s:[\w-]+\]\]\n\nA guard waits\./);
    const rows = await scenes.listForDocument(db, { ...ctx.scope, documentKey: key });
    expect(rows.map((s) => s.heading)).toEqual(['INT. HALL - DAY', 'EXT. RIVER - DAWN']);
  });

  it('falls back to the file name without a title page', async () => {
    const key = await importFountain(db, ctx, {
      workKey,
      parentKey: season,
      fileName: 'pilot draft.txt',
      text: 'EXT. FIELD - DAY\n\nWind.',
    });
    expect((await getWorkingText(db, ctx, key)).document.title).toBe('pilot draft');
  });

  it('refuses a target that cannot hold text, creating nothing', async () => {
    const before = (await getTree(db, ctx)).documents.length;
    await expect(
      importFountain(db, ctx, { workKey, parentKey: null, fileName: 'a.fountain', text: 'x' }),
    ).rejects.toThrow(Invalid);
    const novel = await createWork(db, ctx, { name: 'Book', medium: 'novel' });
    await expect(
      importFountain(db, ctx, { workKey: novel, parentKey: null, fileName: 'a', text: 'x' }),
    ).rejects.toThrow(/holds prose/);
    expect((await getTree(db, ctx)).documents.length).toBe(before);
  });
});

describe('exportDocumentText', () => {
  it('exports Fountain with a title page and no identity markers', async () => {
    const ep = await createDocument(db, ctx, { workKey, parentKey: season, title: 'Ep: One' });
    await saveWorkingText(db, ctx, {
      documentKey: ep,
      text: 'INT. HALL - DAY [[@s:s1]]\n\n[[@e:e1|Bhishma]] waits. [[a note]]',
      baseVersion: 0,
    });
    expect(await exportDocumentText(db, ctx, ep)).toEqual({
      fileName: 'Ep One.fountain',
      text: 'Title: Ep: One\n\nINT. HALL - DAY\n\nBhishma waits. [[a note]]',
    });
  });

  it('round-trips through import', async () => {
    const key = await importFountain(db, ctx, {
      workKey,
      parentKey: season,
      fileName: 'x',
      text: FILE,
    });
    const out = await exportDocumentText(db, ctx, key);
    const again = await importFountain(db, ctx, {
      workKey,
      parentKey: season,
      fileName: out.fileName,
      text: out.text,
    });
    const a = await exportDocumentText(db, ctx, again);
    expect(a.text).toBe(out.text);
  });
});

describe('exportProject', () => {
  it('includes every version and every project collection, but no users or keys', async () => {
    const ep = await createDocument(db, ctx, { workKey, parentKey: season });
    await renameDocument(db, ctx, ep, 'Renamed');
    const backup = await exportProject(db, ctx);

    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, ownerName: 'Test Writer' });
    expect(backup.project._id.equals(ctx.project._id)).toBe(true);
    expect(Object.keys(backup.collections).sort()).toEqual([...PROJECT_COLLECTIONS].sort());
    const versions = backup.collections.documents.filter((d) => d.key === ep);
    expect(versions.map((d) => [d.title, d.isHead])).toEqual([
      ['Episode 1', false],
      ['Renamed', true],
    ]);
    expect(backup.collections.commits.length).toBeGreaterThanOrEqual(3);
    expect(backup.collections.documentVersions.length).toBe(
      await col(db, 'documentVersions').countDocuments({ projectId: ctx.project._id }),
    );

    const json = await exportProjectJson(db, ctx);
    expect(json).not.toContain('SECRET-CIPHERTEXT');
    expect(json).not.toContain('aiKeys');
    expect(json).not.toContain('@example.com');
  });

  it('round-trips ObjectIds and Dates through EJSON', async () => {
    const parsed = BSON.EJSON.parse(await exportProjectJson(db, ctx)) as ProjectBackup;
    expect(parsed.project._id).toBeInstanceOf(ObjectId);
    expect(parsed.project._id.equals(ctx.project._id)).toBe(true);
    expect(parsed.exportedAt).toBeInstanceOf(Date);
    expect(parsed.collections.documents[0]!.createdAt).toBeInstanceOf(Date);
  });

  it('leaves other projects out', async () => {
    const other = await createProject(db, {
      ownerId: new ObjectId(),
      name: 'Other',
      templateKey: 'blank',
    });
    const backup = await exportProject(db, ctx);
    for (const rows of Object.values(backup.collections))
      for (const r of rows) expect((r.projectId as ObjectId).equals(other._id)).toBe(false);
  });
});

describe('restoreProject', () => {
  it('brings a lost project back for a new owner, and replaces only when asked', async () => {
    await renameDocument(db, ctx, season, 'Book One');
    const backup = parseBackup(await exportProjectJson(db, ctx));
    expect(() => parseBackup('{"format":"other"}')).toThrow(Invalid);
    expect(() => parseBackup('not json')).toThrow(Invalid);

    // A queued job in the backup must not run again after the restore.
    backup.collections.jobs.push({
      _id: new ObjectId(),
      projectId: ctx.project._id,
      type: 'extract',
      status: 'queued',
    });
    // Lose everything, as if the database were wiped, then restore for a new account.
    const id = ctx.project._id;
    await col(db, 'projects').deleteOne({ _id: id });
    for (const c of PROJECT_COLLECTIONS) await db.collection(c).deleteMany({ projectId: id });
    const owner = new ObjectId();
    const { rows } = await restoreProject(db, backup, { ownerId: owner });
    expect(rows).toBeGreaterThan(0);

    const restored = await openProject(db, id, owner);
    expect((await getTree(db, restored)).documents.map((d) => d.title)).toContain('Book One');
    expect(await col(db, 'jobs').findOne({ projectId: id, status: 'queued' })).toBeNull();

    await expect(restoreProject(db, backup, { ownerId: owner })).rejects.toBeInstanceOf(Conflict);
    await renameDocument(db, restored, season, 'Changed later');
    await restoreProject(db, backup, { ownerId: owner, replace: true });
    expect((await getTree(db, restored)).documents.map((d) => d.title)).toContain('Book One');
  });
});
