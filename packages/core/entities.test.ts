import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { commit } from './commit';
import { createProject } from './create-project';
import {
  createEntity,
  deleteEntity,
  getEntity,
  listEntities,
  mergeEntities,
  slugify,
  updateEntity,
} from './entities';
import { listEntityTypes } from './entity-types';
import { Invalid, NotFound } from './errors';
import { saveWorkingText } from './save';
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
let T: Record<string, string>; // type name → key

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

const character = (name: string, extra: object = {}) =>
  createEntity(db, ctx, { typeKey: T.Character, name, ...extra });

describe('slugify', () => {
  it('makes readable ASCII-ish slugs and keeps other scripts', () => {
    expect(slugify('  Devavrata (the Vow) ')).toBe('devavrata-the-vow');
    expect(slugify('Ārya Sūta')).toBe('arya-suta');
    expect(slugify('अर्जुन')).toBe('अर्जुन');
    expect(slugify('!!!')).toBe('entry');
  });
});

describe('entries', () => {
  it('creates with type-validated fields, unique slugs and defaults', async () => {
    const a = await character('Arjuna', {
      fields: { role: 'protagonist', want: 'Glory', voice: '' },
    });
    const b = await character('Arjuna');
    const { entity } = await getEntity(db, ctx, a);
    expect(entity).toMatchObject({
      slug: 'arjuna',
      prominence: 'minor',
      canonState: 'canon',
      origin: 'user',
      fields: { role: 'protagonist', want: 'Glory' },
    });
    expect(entity.fields).not.toHaveProperty('voice');
    expect((await getEntity(db, ctx, b)).entity.slug).toBe('arjuna-2');
  });

  it('rejects invalid field values and references to missing or wrong-typed entries', async () => {
    await expect(character('X', { fields: { role: 'king' } })).rejects.toThrow();
    await expect(character('X', { fields: { nope: 1 } })).resolves.toBeTruthy(); // unknown keys are dropped
    await expect(character('X', { fields: { locationKey: 'missing' } })).rejects.toBeInstanceOf(
      Invalid,
    );
    const someone = await character('Someone');
    await expect(character('Y', { fields: { locationKey: someone } })).rejects.toThrow(
      /can't point to "Someone"/,
    );
    const place = await createEntity(db, ctx, { typeKey: T.Place, name: 'River Bank' });
    await expect(character('Z', { fields: { locationKey: place } })).resolves.toBeTruthy();
  });

  it('updates in place by key, re-slugging only on rename', async () => {
    const k = await character('Karna');
    await updateEntity(db, ctx, k, {
      typeKey: T.Character,
      name: 'Karna',
      summary: 'Archer',
      aliases: ['Radheya', 'Karna'],
    });
    expect((await getEntity(db, ctx, k)).entity).toMatchObject({
      slug: 'karna',
      summary: 'Archer',
      aliases: ['Radheya'],
    });
    await updateEntity(db, ctx, k, { typeKey: T.Character, name: 'Vasusena' });
    expect((await getEntity(db, ctx, k)).entity.slug).toBe('vasusena');
  });

  it('lists by prominence, hides scrapped unless asked, and orders events by date', async () => {
    await character('Minor One');
    await character('Lead', { prominence: 'main' });
    await character('Cut', { canonState: 'scrapped', prominence: 'main' });
    const names = (await listEntities(db, ctx)).map((e) => e.name);
    expect(names).toEqual(['Lead', 'Minor One']);
    expect((await listEntities(db, ctx, { includeScrapped: true })).map((e) => e.name)).toContain(
      'Cut',
    );

    const ev = (name: string, start: number) =>
      createEntity(db, ctx, {
        typeKey: T.Event,
        name,
        prominence: 'main',
        fields: { when: { start, end: null, precision: 'year' } },
      });
    await ev('Late', 900);
    await ev('Early', -50);
    const events = (await listEntities(db, ctx))
      .filter((e) => e.typeKey === T.Event)
      .map((e) => e.name);
    expect(events).toEqual(['Early', 'Late']);
  });

  it('deletes and then reports NotFound', async () => {
    const k = await character('Gone');
    await deleteEntity(db, ctx, k);
    await expect(getEntity(db, ctx, k)).rejects.toBeInstanceOf(NotFound);
  });
});

describe('mergeEntities', () => {
  it('folds a duplicate into the kept entry and redirects every reference', async () => {
    const keep = await character('Bhishma', { aliases: ['Grandsire'], tags: ['kuru'] });
    const dup = await character("Ganga's son", {
      aliases: ['Devavrata'],
      summary: 'Took a vow',
      tags: ['vow'],
      fields: { want: 'Duty' },
    });
    const astra = await createEntity(db, ctx, {
      typeKey: T.Astra,
      name: 'Some Astra',
      fields: { holderKey: dup },
    });
    await commit(db, {
      ...ctx.scope,
      message: 'link',
      author: { kind: 'user' },
      changes: [
        {
          op: 'create',
          collection: 'links',
          data: { fromKey: dup, toKey: keep, typeKey: 'x', kind: 'relation' },
        },
        {
          op: 'create',
          collection: 'facts',
          data: { entityKey: dup, field: 'status', value: 'alive' },
        },
      ],
    });
    const workKey = await createWork(db, ctx, { name: 'S', medium: 'film' });
    const doc = await createDocument(db, ctx, { workKey, parentKey: null });
    await saveWorkingText(db, ctx, {
      documentKey: doc,
      text: `[[@e:${dup}|Devavrata]] bows.`,
      baseVersion: 0,
    });

    expect(await mergeEntities(db, ctx, { keepKey: keep, mergeKey: dup })).toEqual({
      textsUpdated: 1,
    });

    const { entity } = await getEntity(db, ctx, keep);
    expect(entity).toMatchObject({
      aliases: ['Grandsire', "Ganga's son", 'Devavrata'],
      tags: ['kuru', 'vow'],
      summary: 'Took a vow',
      fields: { want: 'Duty' },
    });
    await expect(getEntity(db, ctx, dup)).rejects.toBeInstanceOf(NotFound);
    expect((await getEntity(db, ctx, astra)).entity.fields.holderKey).toBe(keep);
    expect((await readHeads(db, 'links', ctx.scope))[0]).toMatchObject({
      fromKey: keep,
      toKey: keep,
    });
    expect((await readHeads(db, 'facts', ctx.scope))[0]).toMatchObject({ entityKey: keep });
    expect((await getWorkingText(db, ctx, doc)).text).toBe(`[[@e:${keep}|Devavrata]] bows.`);
  });

  it('refuses to merge an entry into itself', async () => {
    const k = await character('Solo');
    await expect(mergeEntities(db, ctx, { keepKey: k, mergeKey: k })).rejects.toBeInstanceOf(
      Invalid,
    );
  });
});
