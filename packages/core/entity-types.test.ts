import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { commit } from './commit';
import { createProject } from './create-project';
import {
  createEntityType,
  deleteEntityType,
  listEntityTypes,
  updateEntityType,
} from './entity-types';
import { Conflict, Invalid } from './errors';
import { openProject, type ProjectContext } from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'Test World', templateKey: 'blank' });
  ctx = await openProject(db, p._id, userId);
});

const creature = {
  name: 'Creature',
  pluralName: 'Creatures',
  group: 'land',
  fields: [{ key: 'habitat', label: 'Habitat', kind: 'text' }],
};

describe('createProject with templates', () => {
  it('blank has groups and a calendar but no types', async () => {
    expect(ctx.project.typeGroups.map((g) => g.name)).toEqual([
      'Civilisation',
      'Land',
      'War',
      'Lore',
    ]);
    expect(await listEntityTypes(db, ctx)).toEqual([]);
  });

  it('mythological seeds types, link types and units in commit 1', async () => {
    const userId = new ObjectId();
    const p = await createProject(db, {
      ownerId: userId,
      name: 'Myth',
      templateKey: 'mythological',
    });
    const c = await openProject(db, p._id, userId);
    const types = await listEntityTypes(db, c);
    expect(types.map((t) => t.name)).toContain('Character');
    expect(types[0]?.group).toBe('civilisation');
    expect((await readHeads(db, 'linkTypes', c.scope)).map((l) => l.label)).toContain('parent of');
    expect(c.project.units.map((u) => u.key)).toContain('yojana');
    expect(c.project.seqCounter).toBe(1);
  });
});

describe('entry types', () => {
  it('creates, edits and lists a type', async () => {
    const key = await createEntityType(db, ctx, creature);
    await updateEntityType(db, ctx, key, {
      ...creature,
      traits: ['locatable'],
      fields: [
        ...creature.fields,
        { key: 'diet', label: 'Diet', kind: 'enum', options: ['meat', 'plants'] },
      ],
    });
    const [t] = await listEntityTypes(db, ctx);
    expect(t).toMatchObject({
      key,
      name: 'Creature',
      traits: ['locatable'],
      order: 0,
      icon: 'circle',
      color: 'cat-1',
    });
    expect(t?.fields.map((f) => f.key)).toEqual(['habitat', 'diet']);
  });

  it('rejects unknown groups, dangling references, duplicate keys and empty choices', async () => {
    await expect(createEntityType(db, ctx, { ...creature, group: 'nope' })).rejects.toBeInstanceOf(
      Invalid,
    );
    await expect(
      createEntityType(db, ctx, {
        ...creature,
        fields: [{ key: 'lair', label: 'Lair', kind: 'entityRef', refTypeKeys: ['missing'] }],
      }),
    ).rejects.toBeInstanceOf(Invalid);
    await expect(
      createEntityType(db, ctx, { ...creature, fields: [creature.fields[0], creature.fields[0]] }),
    ).rejects.toThrow(/Two fields use the key/);
    await expect(
      createEntityType(db, ctx, { ...creature, fields: [{ key: 'c', label: 'C', kind: 'enum' }] }),
    ).rejects.toThrow(/needs at least one choice/);
  });

  it('refuses to delete a type that entries or other types use', async () => {
    const key = await createEntityType(db, ctx, creature);
    await createEntityType(db, ctx, {
      ...creature,
      name: 'Beast',
      fields: [{ key: 'kin', label: 'Kin', kind: 'entityRef', refTypeKeys: [key] }],
    });
    await expect(deleteEntityType(db, ctx, key)).rejects.toThrow(/"Beast" refers to "Creature"/);

    const other = await createEntityType(db, ctx, { ...creature, name: 'Spirit' });
    await commit(db, {
      ...ctx.scope,
      message: 'add',
      author: { kind: 'user' },
      changes: [
        {
          op: 'create',
          collection: 'entities',
          data: { typeKey: other, name: 'Wisp', slug: 'wisp' },
        },
      ],
    });
    await expect(deleteEntityType(db, ctx, other)).rejects.toBeInstanceOf(Conflict);
  });

  it('deletes an unused type', async () => {
    const key = await createEntityType(db, ctx, creature);
    await deleteEntityType(db, ctx, key);
    expect(await listEntityTypes(db, ctx)).toEqual([]);
  });
});
