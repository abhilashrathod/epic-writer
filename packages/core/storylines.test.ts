import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeadByKey, scenes } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { Invalid, NotFound } from './errors';
import { saveWorkingText } from './save';
import {
  createStoryline,
  deleteStoryline,
  listScenes,
  listStorylines,
  tagScene,
  updateStoryline,
} from './storylines';
import {
  createDocument,
  createWork,
  openProject,
  renameDocument,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let workKey: string;
let ep1: string;
let ep2: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, {
    ownerId: userId,
    name: 'World',
    templateKey: 'mythological',
  });
  ctx = await openProject(db, p._id, userId);
  workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  const season = await createDocument(db, ctx, { workKey, parentKey: null });
  ep1 = await createDocument(db, ctx, { workKey, parentKey: season });
  ep2 = await createDocument(db, ctx, { workKey, parentKey: season });
});

const save = (documentKey: string, text: string, baseVersion = 0) =>
  saveWorkingText(db, ctx, { documentKey, text, baseVersion });
const scene = (sceneKey: string) => scenes.findByKey(db, { ...ctx.scope, sceneKey });

async function character(name: string): Promise<string> {
  const type = (await listEntityTypes(db, ctx)).find((t) => t.traits.includes('born'))!;
  return createEntity(db, ctx, { typeKey: type.key, name });
}

describe('storylines', () => {
  it('creates, lists, edits and deletes storylines as versions', async () => {
    const karna = await character('Karna');
    const a = await createStoryline(db, ctx, { name: "Karna's thread", focusEntityKeys: [karna] });
    const b = await createStoryline(db, ctx, { name: 'The dice game', color: 'cat-3', workKey });
    expect((await listStorylines(db, ctx)).map((s) => [s.name, s.color, s.workKey])).toEqual([
      ["Karna's thread", 'cat-1', null],
      ['The dice game', 'cat-3', workKey],
    ]);

    await updateStoryline(db, ctx, a, { name: 'Karna', color: 'cat-5' });
    const head = await readHeadByKey(db, 'storylines', ctx.scope, a);
    expect(head).toMatchObject({ name: 'Karna', color: 'cat-5', focusEntityKeys: [karna] });
    expect(head!.seq).toBeGreaterThan(1);

    await deleteStoryline(db, ctx, b);
    expect((await listStorylines(db, ctx)).map((s) => s.key)).toEqual([a]);
  });

  it('rejects bad input and unknown references', async () => {
    await expect(createStoryline(db, ctx, { name: ' ' })).rejects.toThrow();
    await expect(createStoryline(db, ctx, { name: 'X', color: '#ff0000' })).rejects.toThrow();
    await expect(createStoryline(db, ctx, { name: 'X', workKey: 'nope' })).rejects.toThrow(Invalid);
    await expect(
      createStoryline(db, ctx, { name: 'X', focusEntityKeys: ['nope'] }),
    ).rejects.toThrow(Invalid);
    await expect(updateStoryline(db, ctx, 'nope', { name: 'Y' })).rejects.toThrow(NotFound);
    await expect(deleteStoryline(db, ctx, 'nope')).rejects.toThrow(NotFound);
  });
});

describe('scene tags', () => {
  it('tags scenes, survives saves and untags on storyline delete', async () => {
    const thread = await createStoryline(db, ctx, { name: 'Vow' });
    await save(ep1, 'INT. HALL [[@s:s1]]\n\nBhishma vows.\n\nEXT. RIVER [[@s:s2]]\n\nMist.');
    await tagScene(db, ctx, 's1', { storylineKeys: [thread, thread] });
    expect((await scene('s1'))!.storylineKeys).toEqual([thread]);

    // Re-derived on save: the heading changes, the tag stays, and set story time is kept too.
    await scenes.setTags(
      db,
      { ...ctx.scope, sceneKey: 's1' },
      {
        storyTime: { start: 5, end: null, precision: 'day' },
      },
    );
    await save(ep1, 'INT. GREAT HALL [[@s:s1]]\n\nBhishma vows.\n\nEXT. RIVER [[@s:s2]]', 1);
    expect(await scene('s1')).toMatchObject({
      heading: 'INT. GREAT HALL',
      storylineKeys: [thread],
      storyTime: { start: 5 },
    });
    expect((await scene('s2'))!.storylineKeys).toEqual([]);

    // A scene cut from one episode and pasted into another keeps its tags.
    await save(ep2, 'INT. HALL [[@s:s1]]\n\nLater.');
    await save(ep1, 'EXT. RIVER [[@s:s2]]', 2);
    expect((await scene('s1'))!).toMatchObject({ documentKey: ep2, storylineKeys: [thread] });

    await deleteStoryline(db, ctx, thread);
    expect((await scene('s1'))!.storylineKeys).toEqual([]);
  });

  it('validates tags and sets point of view on prose scenes only', async () => {
    const ganga = await character('Ganga');
    await save(ep1, 'INT. HALL [[@s:s1]]');
    await expect(tagScene(db, ctx, 'missing', { storylineKeys: [] })).rejects.toThrow(NotFound);
    await expect(tagScene(db, ctx, 's1', { storylineKeys: ['nope'] })).rejects.toThrow(Invalid);
    await expect(tagScene(db, ctx, 's1', { povEntityKey: ganga })).rejects.toThrow(Invalid);
    await expect(tagScene(db, ctx, 's1', {})).rejects.toThrow();

    const novel = await createWork(db, ctx, { name: 'Novel', medium: 'novel' });
    const chapter = await createDocument(db, ctx, { workKey: novel, parentKey: null });
    await save(chapter, '# By the river <!-- s:p1 -->\nShe waits.');
    await expect(tagScene(db, ctx, 'p1', { povEntityKey: 'nope' })).rejects.toThrow(Invalid);
    await tagScene(db, ctx, 'p1', { povEntityKey: ganga });
    expect((await scene('p1'))!.povEntityKey).toBe(ganga);
    await tagScene(db, ctx, 'p1', { povEntityKey: null });
    expect((await scene('p1'))!.povEntityKey).toBeNull();
  });
});

describe('listScenes', () => {
  it('lists a work’s scenes in narrative order with their document', async () => {
    await save(ep2, 'INT. B [[@s:b]]\n\n[[@e:k1|Karna]] waits.');
    await save(ep1, 'INT. A1 [[@s:a1]]\n\nEXT. A2 [[@s:a2]]');
    await renameDocument(db, ctx, ep1, 'Pilot');
    const novel = await createWork(db, ctx, { name: 'Novel', medium: 'novel' });
    const chapter = await createDocument(db, ctx, { workKey: novel, parentKey: null });
    await save(chapter, '# One <!-- s:n1 -->\nText.');

    const list = await listScenes(db, ctx, workKey);
    expect(list.map((s) => [s.sceneKey, s.documentTitle])).toEqual([
      ['a1', 'Pilot'],
      ['a2', 'Pilot'],
      ['b', 'Episode 2'],
    ]);
    expect(list[2]).toMatchObject({ entityKeys: ['k1'], documentFormat: 'fountain' });
    expect((await listScenes(db, ctx)).map((s) => s.sceneKey)).toContain('n1');
  });
});
