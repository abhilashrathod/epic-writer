import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeadByKey } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { commit, versionBody } from './commit';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { createEntityType } from './entity-types';
import { undoCommit } from './history';
import { loadNarrativeIndex, migrateNarrativeRefs } from './narrative-index';
import { saveWorkingText } from './save';
import { createDocument, createWork, openProject, type ProjectContext } from './works';

describe('narrative references in a project', () => {
  let db: Db;
  let drop: () => Promise<void>;
  let ctx: ProjectContext;
  let typeKey: string;
  let episode: string;
  let season: string;
  let workKey: string;

  beforeAll(async () => {
    ({ db, drop } = await createTestDb());
    const ownerId = new ObjectId();
    const p = await createProject(db, { ownerId, name: 'W', templateKey: 'blank' });
    ctx = await openProject(db, p._id, ownerId);
    workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
    season = await createDocument(db, ctx, { workKey, parentKey: null });
    episode = await createDocument(db, ctx, { workKey, parentKey: season, title: 'First Oath' });
    await saveWorkingText(db, ctx, {
      documentKey: episode,
      text: 'INT. PALACE - DAY [[@s:s1]]\n\nA line.\n\nEXT. FORD - DAY [[@s:s2]]\n\nAnother.\n\nINT. PALACE - DAY [[@s:s3]]\n\nAgain.',
      baseVersion: 0,
    });
    typeKey = await createEntityType(db, ctx, {
      name: 'Promise',
      pluralName: 'Promises',
      group: ctx.project.typeGroups[0]!.key,
      traits: [],
      fields: [
        { key: 'paidOffAt', label: 'Paid off at', kind: 'list', ai: 'read' },
        { key: 'skills', label: 'Skills', kind: 'list', ai: 'read' },
      ],
    });
  }, 30_000);
  afterAll(() => drop());

  const makeEntry = (name: string, paidOffAt: string[]) =>
    createEntity(db, ctx, { typeKey, name, fields: { paidOffAt, skills: ['First Oath'] } });
  const head = async (key: string) => (await readHeadByKey(db, 'entities', ctx.scope, key))!;

  it('links what it can, keeps the rest as labels, drops nothing, and undoes cleanly', async () => {
    const key = await makeEntry('Bow Promise', [
      'First Oath',
      'S01E01 sc 2',
      'INT. PALACE - DAY',
      'the finale',
    ]);
    const counts = await migrateNarrativeRefs(db, ctx);
    expect(counts).toEqual({ types: 1, entries: 1, linked: 2, needsLink: 2 });

    const type = await readHeadByKey(db, 'entityTypes', ctx.scope, typeKey);
    expect(type!.fields.map((f) => f.kind)).toEqual(['narrativeRefList', 'list']);

    const e = await head(key);
    const items = e.fields.paidOffAt as Record<string, unknown>[];
    expect(items.map((i) => i.label)).toEqual([
      'First Oath',
      'S01E01 sc 2',
      'INT. PALACE - DAY',
      'the finale',
    ]);
    expect(items[0]).toMatchObject({ workKey, documentKey: episode, sceneKey: null });
    expect(items[1]).toMatchObject({ documentKey: episode, sceneKey: 's2' });
    // A slugline used twice is left for the writer rather than guessed.
    expect(items[2]).toMatchObject({ documentKey: null, order: null });
    expect(items[3]).toMatchObject({ documentKey: null, order: null });
    expect(e.fields.skills).toEqual(['First Oath']);

    expect(await migrateNarrativeRefs(db, ctx)).toEqual({
      types: 0,
      entries: 0,
      linked: 0,
      needsLink: 0,
    });

    await undoCommit(db, ctx, e.seq);
    expect((await head(key)).fields.paidOffAt).toEqual([
      'First Oath',
      'S01E01 sc 2',
      'INT. PALACE - DAY',
      'the finale',
    ]);
    await migrateNarrativeRefs(db, ctx);
  }, 30_000);

  it('converts an unset field to nothing and saves a canonical order on new links', async () => {
    const index = await loadNarrativeIndex(db, ctx);
    const scene = index.scenes.find((s) => s.sceneKey === 's2')!;
    const key = await createEntity(db, ctx, {
      typeKey,
      name: 'Linked',
      fields: {
        paidOffAt: [
          { workKey: 'stale', documentKey: episode, sceneKey: 's2', order: '9999', label: 'mine' },
        ],
      },
    });
    expect((await head(key)).fields.paidOffAt).toEqual([
      { workKey, documentKey: episode, sceneKey: 's2', order: scene.order, label: 'mine' },
    ]);
  });

  it('refuses a place that does not exist', async () => {
    await expect(
      createEntity(db, ctx, {
        typeKey,
        name: 'Broken',
        fields: {
          paidOffAt: [{ workKey, documentKey: 'gone', sceneKey: null, order: '0001' }],
        },
      }),
    ).rejects.toThrow('no longer exists');
  });

  it('converts a fact value too', async () => {
    const other = await createEntityType(db, ctx, {
      name: 'Rumour',
      pluralName: 'Rumours',
      group: ctx.project.typeGroups[0]!.key,
      traits: [],
      fields: [{ key: 'hinted', label: 'Hinted', kind: 'list', timeVarying: true, ai: 'read' }],
    });
    const entity = await createEntity(db, ctx, { typeKey: other, name: 'Whisper', fields: {} });
    const { keys } = await commit(db, {
      ...ctx.scope,
      message: 'fact',
      author: { kind: 'user', userId: ctx.userId },
      changes: [
        {
          op: 'create',
          collection: 'facts',
          data: {
            entityKey: entity,
            field: 'hinted',
            value: ['First Oath', 'nowhere yet'],
            storyTime: null,
            narrativeRefs: [],
            causeKey: null,
            canonState: 'canon',
            note: '',
            sourceRef: null,
            origin: 'user',
            proposalId: null,
          },
        },
      ],
    });
    await migrateNarrativeRefs(db, ctx);
    const fact = await readHeadByKey(db, 'facts', ctx.scope, keys[0]!);
    expect(versionBody(fact!).value).toMatchObject([
      { documentKey: episode, label: 'First Oath' },
      { documentKey: null, label: 'nowhere yet' },
    ]);
  }, 30_000);
});
