import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { Invalid, NotFound } from './errors';
import {
  createDocument,
  createWork,
  deleteDocument,
  getTree,
  getWorkingText,
  levelsFrom,
  moveDocument,
  openProject,
  renameDocument,
  setWorkLevels,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
const userId = new ObjectId();

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const p = await createProject(db, { ownerId: userId, name: 'Test World', templateKey: 'blank' });
  ctx = await openProject(db, p._id, userId);
});

/** [title, orderPath] for every document, in tree order. */
const outline = async () => (await getTree(db, ctx)).documents.map((d) => [d.title, d.orderPath]);

async function series() {
  const workKey = await createWork(db, ctx, { name: 'The Series', medium: 'series' });
  const s1 = await createDocument(db, ctx, { workKey, parentKey: null });
  const e1 = await createDocument(db, ctx, { workKey, parentKey: s1 });
  const e2 = await createDocument(db, ctx, { workKey, parentKey: s1 });
  return { workKey, s1, e1, e2 };
}

describe('openProject', () => {
  it('rejects users who are not members, as NotFound', async () => {
    await expect(openProject(db, ctx.project._id, new ObjectId())).rejects.toBeInstanceOf(NotFound);
    await expect(openProject(db, new ObjectId(), userId)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('works and documents', () => {
  it('creates a series with seasons as containers and episodes as Fountain text', async () => {
    await series();
    const { works, documents } = await getTree(db, ctx);
    expect(works[0]).toMatchObject({
      name: 'The Series',
      medium: 'series',
      defaultContentType: 'screenplay',
    });
    expect(documents.map((d) => [d.title, d.kind, d.format, d.orderPath])).toEqual([
      ['Season 1', 'container', 'fountain', '0001'],
      ['Episode 1', 'text', 'fountain', '0001.0001'],
      ['Episode 2', 'text', 'fountain', '0001.0002'],
    ]);
  });

  it('gives text documents an empty working copy, and containers none', async () => {
    const { s1, e1 } = await series();
    expect(await getWorkingText(db, ctx, e1)).toMatchObject({ text: '', version: 0 });
    await expect(getWorkingText(db, ctx, s1)).rejects.toBeInstanceOf(Invalid);
  });

  it('uses Markdown for prose works and refuses levels below the last', async () => {
    const workKey = await createWork(db, ctx, { name: 'Novel', medium: 'novel' });
    const ch = await createDocument(db, ctx, { workKey, parentKey: null, title: 'Prologue' });
    expect((await getTree(db, ctx)).documents[0]).toMatchObject({
      title: 'Prologue',
      format: 'markdown',
    });
    await expect(createDocument(db, ctx, { workKey, parentKey: ch })).rejects.toBeInstanceOf(
      Invalid,
    );
  });

  it('lets a document override the work’s content type', async () => {
    const workKey = await createWork(db, ctx, { name: 'Film', medium: 'film' });
    await createDocument(db, ctx, { workKey, parentKey: null, contentType: 'note' });
    expect((await getTree(db, ctx)).documents[0]).toMatchObject({
      contentType: 'note',
      format: 'markdown',
    });
  });

  it('renames through a new version', async () => {
    const { e1 } = await series();
    await renameDocument(db, ctx, e1, '  The Vow ');
    expect(await outline()).toContainEqual(['The Vow', '0001.0001']);
  });

  it('moves siblings and rewrites descendant order paths', async () => {
    const { workKey, s1 } = await series();
    const s2 = await createDocument(db, ctx, { workKey, parentKey: null });
    await createDocument(db, ctx, { workKey, parentKey: s2 });
    await moveDocument(db, ctx, s2, 'up');
    expect(await outline()).toEqual([
      ['Season 2', '0001'],
      ['Episode 1', '0001.0001'],
      ['Season 1', '0002'],
      ['Episode 1', '0002.0001'],
      ['Episode 2', '0002.0002'],
    ]);
    const seqBefore = (await openProject(db, ctx.project._id, userId)).project.seqCounter;
    await moveDocument(db, ctx, s2, 'up'); // already first: no commit
    expect((await openProject(db, ctx.project._id, userId)).project.seqCounter).toBe(seqBefore);
    await moveDocument(db, ctx, s1, 'down'); // already last
  });

  it('deletes a container with its children and closes the numbering gap', async () => {
    const { workKey, s1 } = await series();
    await createDocument(db, ctx, { workKey, parentKey: null });
    await deleteDocument(db, ctx, s1);
    expect(await outline()).toEqual([['Season 2', '0001']]);
    expect(await readHeads(db, 'documents', ctx.scope)).toHaveLength(1);
  });

  it('rejects unknown keys and blank names', async () => {
    await expect(renameDocument(db, ctx, 'nope', 'x')).rejects.toBeInstanceOf(NotFound);
    await expect(
      createDocument(db, ctx, { workKey: 'nope', parentKey: null }),
    ).rejects.toBeInstanceOf(NotFound);
    await expect(createWork(db, ctx, { name: ' ', medium: 'film' })).rejects.toBeInstanceOf(
      Invalid,
    );
  });
});

describe('work structure levels (WK-2)', () => {
  it('keeps keys by position and names new levels from their names', () => {
    const old = levelsFrom([{ singular: 'Season', plural: 'Seasons' }]);
    expect(old[0]).toMatchObject({ key: 'season', labelFormat: '{singular} {number}' });
    const next = levelsFrom(
      [
        { singular: 'Arc', plural: 'Arcs' },
        { singular: 'Part', plural: 'Parts' },
        { singular: 'Part', plural: 'Parts' },
      ],
      old,
    );
    expect(next.map((l) => l.key)).toEqual(['season', 'part', 'part2']);
  });

  it('creates a work with its own levels and reshapes it only while empty', async () => {
    const levels = [
      { singular: 'Book', plural: 'Books' },
      { singular: 'Part', plural: 'Parts' },
      { singular: 'Chapter', plural: 'Chapters' },
    ];
    const workKey = await createWork(db, ctx, { name: 'Saga', medium: 'novel', levels });
    const book = await createDocument(db, ctx, { workKey, parentKey: null });
    const part = await createDocument(db, ctx, { workKey, parentKey: book });
    const chapter = await createDocument(db, ctx, { workKey, parentKey: part });
    const { documents, works } = await getTree(db, ctx);
    expect(documents.find((d) => d.key === chapter)).toMatchObject({
      kind: 'text',
      title: 'Chapter 1',
    });
    expect(documents.find((d) => d.key === part)).toMatchObject({ kind: 'container' });

    await setWorkLevels(db, ctx, workKey, [
      { singular: 'Volume', plural: 'Volumes' },
      ...levels.slice(1),
    ]);
    const after = (await getTree(db, ctx)).works.find((w) => w.key === workKey)!;
    expect(after.levels.map((l) => [l.key, l.singular])).toEqual([
      [works.find((w) => w.key === workKey)!.levels[0]!.key, 'Volume'],
      ['part', 'Part'],
      ['chapter', 'Chapter'],
    ]);
    await expect(setWorkLevels(db, ctx, workKey, levels.slice(1))).rejects.toBeInstanceOf(Invalid);
    await expect(setWorkLevels(db, ctx, 'nope', levels)).rejects.toBeInstanceOf(NotFound);
  });
});
