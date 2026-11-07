import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { createEntityType, listEntityTypes } from './entity-types';
import { Conflict, Invalid } from './errors';
import { createLink, createLinkType, deleteLink, entityRelations, listLinkTypes } from './links';
import { saveWorkingText } from './save';
import { createDocument, createWork, openProject, type ProjectContext } from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let T: Record<string, string>;
let L: Record<string, string>;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, {
    ownerId: userId,
    name: 'Test World',
    templateKey: 'mythological',
  });
  ctx = await openProject(db, p._id, userId);
  T = Object.fromEntries((await listEntityTypes(db, ctx)).map((t) => [t.name, t.key]));
  L = Object.fromEntries((await listLinkTypes(db, ctx)).map((t) => [t.label, t.key]));
});

const entry = (type: string, name: string, fields: object = {}) =>
  createEntity(db, ctx, { typeKey: T[type], name, fields });

describe('links', () => {
  it('reads connections from each side with the right label', async () => {
    const parent = await entry('Character', 'Shantanu');
    const child = await entry('Character', 'Bhishma');
    const house = await entry('Dynasty', 'Kuru');
    await createLink(db, ctx, { typeKey: L['parent of'], fromKey: parent, toKey: child });
    await createLink(db, ctx, {
      typeKey: L['member of'],
      fromKey: child,
      toKey: house,
      note: 'by birth',
    });

    const c = (await entityRelations(db, ctx, child)).connections;
    expect(c.map((x) => [x.kind, x.label, x.otherKey, x.note])).toEqual(
      expect.arrayContaining([
        ['kinship', 'child of', parent, ''],
        ['membership', 'member of', house, 'by birth'],
      ]),
    );
    expect((await entityRelations(db, ctx, house)).connections[0]).toMatchObject({
      label: 'has member',
      otherKey: child,
    });
  });

  it('keeps symmetric labels the same from both sides and blocks duplicates either way', async () => {
    const a = await entry('Character', 'A');
    const b = await entry('Character', 'B');
    await createLink(db, ctx, { typeKey: L['spouse of'], fromKey: a, toKey: b });
    expect((await entityRelations(db, ctx, b)).connections[0]?.label).toBe('spouse of');
    await expect(
      createLink(db, ctx, { typeKey: L['spouse of'], fromKey: b, toKey: a }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('enforces the entry types a connection allows, and refuses self-links', async () => {
    const person = await entry('Character', 'Someone');
    const place = await entry('Place', 'Somewhere');
    await expect(
      createLink(db, ctx, { typeKey: L['parent of'], fromKey: person, toKey: place }),
    ).rejects.toThrow(/can’t be parent of/);
    await expect(
      createLink(db, ctx, { typeKey: L['parent of'], fromKey: person, toKey: person }),
    ).rejects.toBeInstanceOf(Invalid);
  });

  it('stores when a connection begins and where it is revealed', async () => {
    const a = await entry('Character', 'A');
    const b = await entry('Character', 'B');
    const storyTime = { start: 3600, end: null, precision: 'year' as const };
    const ref = { workKey: 'w1', documentKey: 'd1', sceneKey: '', order: '0001.0004' };
    await createLink(db, ctx, {
      typeKey: L['parent of'],
      fromKey: a,
      toKey: b,
      storyTime,
      narrativeRefs: [ref],
    });
    const [link] = await readHeads(db, 'links', ctx.scope);
    expect(link).toMatchObject({ storyTime, narrativeRefs: [ref] });
  });

  it('removes a connection', async () => {
    const a = await entry('Character', 'A');
    const b = await entry('Character', 'B');
    const k = await createLink(db, ctx, { typeKey: L['ally of'], fromKey: a, toKey: b });
    await deleteLink(db, ctx, k);
    expect((await entityRelations(db, ctx, a)).connections).toEqual([]);
  });

  it('creates custom connection types for any project', async () => {
    const creature = await createEntityType(db, ctx, {
      name: 'Creature',
      pluralName: 'Creatures',
      group: 'land',
    });
    const key = await createLinkType(db, ctx, {
      label: 'rides',
      inverseLabel: 'ridden by',
      kind: 'relation',
      fromTypeKeys: [T.Character],
      toTypeKeys: [creature],
    });
    expect((await listLinkTypes(db, ctx)).find((t) => t.key === key)).toMatchObject({
      label: 'rides',
      symmetric: false,
    });
    await expect(
      createLinkType(db, ctx, {
        label: 'x',
        inverseLabel: 'y',
        kind: 'relation',
        toTypeKeys: ['nope'],
      }),
    ).rejects.toBeInstanceOf(Invalid);
  });
});

describe('entityRelations', () => {
  it('lists entries whose fields point here, and the scenes that mention it', async () => {
    const kingdom = await entry('Kingdom', 'Northern Realm');
    const ev = await entry('Event', 'The Siege', { where: kingdom });
    const workKey = await createWork(db, ctx, { name: 'S', medium: 'film' });
    const doc = await createDocument(db, ctx, { workKey, parentKey: null, title: 'Draft' });
    await saveWorkingText(db, ctx, {
      documentKey: doc,
      text: `EXT. WALLS - DAY [[@s:s1]]\n\nSmoke over [[@e:${kingdom}|the realm]].\n\nINT. HALL [[@s:s2]]\n\nQuiet.`,
      baseVersion: 0,
    });

    const r = await entityRelations(db, ctx, kingdom);
    expect(r.referencedBy).toEqual([{ entityKey: ev, fieldLabel: 'Where' }]);
    expect(r.appearances).toEqual([
      {
        documentKey: doc,
        documentTitle: 'Draft',
        sceneKey: 's1',
        heading: 'EXT. WALLS - DAY',
        order: '0001.0001',
        first: true,
      },
    ]);
  });
});
