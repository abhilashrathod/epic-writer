import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { projects, readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { entityTypeInput } from '@epic/schemas/api';
import { createProject } from './create-project';
import { NotFound } from './errors';
import { lifeFields } from './asof';
import { TYPE_CATALOGUE } from './type-catalogue';
import { applyTypeTemplate, listTypeTemplates } from './type-templates';
import { openProject, type ProjectContext } from './works';

describe('type catalogue', () => {
  it('has the 101 types in five groups', () => {
    const count = (g: string) => TYPE_CATALOGUE.filter((t) => t.group === g).length;
    expect(TYPE_CATALOGUE).toHaveLength(101);
    expect(['Land', 'Civilisation', 'War', 'Rule systems', 'Story'].map(count)).toEqual([
      31, 37, 15, 10, 8,
    ]);
  });

  it('has valid types whose references, holders and birth dates all work', () => {
    const ids = new Set(TYPE_CATALOGUE.map((t) => t.id));
    expect(ids.size).toBe(TYPE_CATALOGUE.length);
    for (const t of TYPE_CATALOGUE) {
      entityTypeInput.parse({ ...t, pluralName: t.plural, group: 'g', refs: undefined });
      for (const f of t.fields)
        for (const r of f.refs ?? [])
          expect(r === '@geo' || ids.has(r), `${t.id}.${f.key}`).toBe(true);
      if (t.traits.includes('holdable'))
        expect(t.fields.find((f) => f.key === 'holderKey')?.timeVarying, t.id).toBe(true);
      if (t.traits.includes('born')) expect(lifeFields(t.fields).born, t.id).toBeTruthy();
    }
  });
});

describe('AI access in the catalogue', () => {
  const access = (typeId: string, key: string) =>
    TYPE_CATALOGUE.find((t) => t.id === typeId)!.fields.find((f) => f.key === key)!.ai;

  it('hides private notes, keeps intent readable and lets scenes fill what they can state', () => {
    for (const t of TYPE_CATALOGUE)
      expect(t.fields.find((f) => f.key === 'notes')?.ai).toBe('hidden');
    expect(access('character', 'castingNotes')).toBe('hidden');
    for (const k of [
      'want',
      'backstory',
      'fate',
      'voiceSamples',
      'arcSummary',
      'temperament',
      'fears',
    ])
      expect(access('character', k), k).toBe('read');
    for (const k of ['hair', 'status', 'locationKey', 'allegiance', 'possessions'])
      expect(access('character', k), k).toBe('extract');
    expect(access('prophecy-omen', 'trueMeaning')).toBe('read');
    expect(access('mystery-open-question', 'answer')).toBe('read');
    expect(access('setup-payoff', 'payoff')).toBe('read');
    expect(access('rule-system', 'storyPurpose')).toBe('read');
    expect(access('account-source', 'writerSNote')).toBe('read');
    expect(access('weapon', 'holderKey')).toBe('extract');
  });

  it('describes every type in one or two sentences', () => {
    for (const t of TYPE_CATALOGUE) expect(t.description.length, t.id).toBeGreaterThan(20);
    for (const t of TYPE_CATALOGUE) expect(t.description.length, t.id).toBeLessThanOrEqual(400);
  });

  it('never offers Character more fields than the per-entry cap', () => {
    const c = TYPE_CATALOGUE.find((t) => t.id === 'character')!;
    expect(c.fields.filter((f) => f.ai === 'extract').length).toBeLessThanOrEqual(60);
  });
});

describe('applyTypeTemplate', () => {
  let db: Db;
  let drop: () => Promise<void>;
  const open = async (templateKey: 'blank' | 'mythological'): Promise<ProjectContext> => {
    const ownerId = new ObjectId();
    const p = await createProject(db, { ownerId, name: 'World', templateKey });
    return openProject(db, p._id, ownerId);
  };
  const typeNamed = async (ctx: ProjectContext, name: string) =>
    (await readHeads(db, 'entityTypes', ctx.scope)).find((t) => t.name === name)!;

  beforeAll(async () => {
    ({ db, drop } = await createTestDb());
  });
  afterAll(() => drop());

  it('rejects an unknown template', async () => {
    await expect(applyTypeTemplate(db, await open('blank'), 'nope')).rejects.toThrow(NotFound);
  });

  it('adds the type, its group and a unit, and later types join its reference lists', async () => {
    const ctx = await open('blank');
    const key = await applyTypeTemplate(db, ctx, 'theme');
    const project = await projects.findById(db, ctx.project._id);
    expect(project!.typeGroups.map((g) => g.key)).toContain('story');

    const fresh = await openProject(db, ctx.project._id, ctx.userId);
    const riverKey = await applyTypeTemplate(db, fresh, 'river');
    expect(key).not.toBe(riverKey);
    expect((await projects.findById(db, ctx.project._id))!.units).toHaveLength(1);

    const again = await openProject(db, ctx.project._id, ctx.userId);
    const mountainKey = await applyTypeTemplate(db, again, 'mountain-range-pass');
    const river = await typeNamed(ctx, 'River');
    expect(river.fields.find((f) => f.key === 'source')!.refTypeKeys).toContain(mountainKey);
  });

  it('adds only missing fields to a type the project has, keeping what is there', async () => {
    const ctx = await open('mythological');
    const before = await typeNamed(ctx, 'Character');
    const key = await applyTypeTemplate(db, ctx, 'character');
    const after = await typeNamed(ctx, 'Character');
    expect(key).toBe(before.key);
    expect(after.fields.slice(0, before.fields.length)).toEqual(before.fields);
    expect(after.fields.length).toBeGreaterThan(60);
    expect(after.fields.filter((f) => f.key === 'role')).toHaveLength(1);
    expect(after.description).toContain('Any person');

    const list = await listTypeTemplates(db, ctx);
    expect(list.find((t) => t.id === 'character')).toMatchObject({
      existingKey: key,
      missingFieldCount: 0,
    });
    const seq = (await readHeads(db, 'entityTypes', ctx.scope)).length;
    await applyTypeTemplate(db, ctx, 'character');
    expect((await readHeads(db, 'entityTypes', ctx.scope)).length).toBe(seq);
  });

  it('lists searchable text from field labels and choices', async () => {
    const list = await listTypeTemplates(db, await open('blank'));
    expect(list).toHaveLength(101);
    expect(list.find((t) => t.id === 'dwelling-home')).toMatchObject({
      existingKey: null,
      search: expect.stringContaining('hut'),
    });
  });
});
