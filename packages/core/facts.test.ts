import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createTestDb } from '@epic/db/testing';
import { resolveFields } from './asof';
import { createProject } from './create-project';
import { createEntity, updateEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { Invalid } from './errors';
import { addFact, deleteFact, listFacts, worldSnapshot } from './facts';
import { createLink, listLinkTypes } from './links';
import { openProject, type ProjectContext } from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let T: Record<string, string>;

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
});

const year = (y: number) => ({ start: y * 360, end: null, precision: 'year' as const });

describe('facts', () => {
  it('records changes to time-varying fields that resolve as of a point', async () => {
    const hero = await createEntity(db, ctx, {
      typeKey: T.Character,
      name: 'Hero',
      fields: { status: 'alive' },
    });
    const villain = await createEntity(db, ctx, { typeKey: T.Character, name: 'Villain' });
    const arrow = await createEntity(db, ctx, {
      typeKey: T.Astra,
      name: 'Arrow',
      fields: { holderKey: hero, charges: 3 },
    });
    const battle = await createEntity(db, ctx, { typeKey: T.Event, name: 'Battle' });
    await addFact(db, ctx, {
      entityKey: arrow,
      field: 'holderKey',
      value: villain,
      storyTime: year(20),
      causeKey: battle,
    });
    await addFact(db, ctx, { entityKey: arrow, field: 'charges', value: 1, storyTime: year(21) });
    await addFact(db, ctx, {
      entityKey: hero,
      field: 'status',
      value: 'dead',
      storyTime: year(21),
    });

    const facts = await listFacts(db, ctx, arrow);
    expect(facts.map((f) => [f.field, f.value, f.causeKey])).toEqual([
      ['holderKey', villain, battle],
      ['charges', 1, null],
    ]);
    const { entities, facts: all } = await worldSnapshot(db, ctx);
    const a = entities.find((e) => e.key === arrow)!;
    const asOf = (y: number) =>
      resolveFields(
        a.fields,
        all.filter((f) => f.entityKey === arrow),
        { storyTime: y * 360, workKey: null, order: null },
      );
    expect(asOf(10)).toMatchObject({ holderKey: hero, charges: 3 });
    expect(asOf(20)).toMatchObject({ holderKey: villain, charges: 3 });
    expect(asOf(22)).toMatchObject({ holderKey: villain, charges: 1 });
  });

  it('refuses fields that are not time-varying, bad values and missing references', async () => {
    const hero = await createEntity(db, ctx, { typeKey: T.Character, name: 'Hero' });
    await expect(
      addFact(db, ctx, { entityKey: hero, field: 'want', value: 'x', storyTime: year(1) }),
    ).rejects.toThrow(/doesn't change over time/);
    await expect(
      addFact(db, ctx, { entityKey: hero, field: 'status', value: 'sleeping', storyTime: year(1) }),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      addFact(db, ctx, {
        entityKey: hero,
        field: 'locationKey',
        value: 'nope',
        storyTime: year(1),
      }),
    ).rejects.toThrow(/doesn't exist/);
    await expect(
      addFact(db, ctx, { entityKey: hero, field: 'status', value: '', storyTime: year(1) }),
    ).rejects.toThrow(/Give "Status" a value/);
  });

  it('deletes a change', async () => {
    const hero = await createEntity(db, ctx, { typeKey: T.Character, name: 'Hero' });
    const k = await addFact(db, ctx, {
      entityKey: hero,
      field: 'status',
      value: 'dead',
      storyTime: year(1),
    });
    await deleteFact(db, ctx, k);
    expect(await listFacts(db, ctx, hero)).toEqual([]);
  });
});

describe('worldSnapshot', () => {
  it('leaves out scrapped entries and anything that touches them', async () => {
    const a = await createEntity(db, ctx, { typeKey: T.Character, name: 'A' });
    const b = await createEntity(db, ctx, { typeKey: T.Character, name: 'B' });
    const L = Object.fromEntries((await listLinkTypes(db, ctx)).map((t) => [t.label, t.key]));
    await createLink(db, ctx, { typeKey: L['ally of'], fromKey: a, toKey: b });
    await addFact(db, ctx, { entityKey: b, field: 'status', value: 'dead', storyTime: year(3) });
    await updateEntity(db, ctx, b, { typeKey: T.Character, name: 'B', canonState: 'scrapped' });
    const w = await worldSnapshot(db, ctx);
    expect(w.entities.map((e) => e.name)).toEqual(['A']);
    expect(w.links).toEqual([]);
    expect(w.facts).toEqual([]);
  });
});
