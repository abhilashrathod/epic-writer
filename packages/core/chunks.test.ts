import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { chunks } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import {
  cosine,
  fieldRef,
  keywordScore,
  longFieldChunks,
  relevantLongFields,
  splitIntoChunks,
  type ChunkEmbedder,
} from './chunks';
import { createProject } from './create-project';
import { openProject, type ProjectContext } from './works';

const long = (word: string) => `${word} `.repeat(60).trim();
const type = (ai: 'extract' | 'read' | 'hidden', timeVarying = false) => ({
  key: 't',
  fields: [{ key: 'body', kind: 'richtext', ai, timeVarying }],
});
const entity = (key: string, body: string, canonState = 'canon') => ({
  key,
  typeKey: 't',
  canonState,
  fields: { body },
});

describe('pure helpers', () => {
  it('splits by paragraph within the limit and never loses text', () => {
    const parts = splitIntoChunks(`${'a'.repeat(30)}\n\n${'b'.repeat(30)}`, 40);
    expect(parts).toEqual(['a'.repeat(30), 'b'.repeat(30)]);
    expect(splitIntoChunks('x'.repeat(90), 40).join('')).toBe('x'.repeat(90));
  });

  it('chunks long read fields only: never hidden, short, scrapped or changing ones', () => {
    expect(longFieldChunks([entity('a', long('river'))], [type('read')])).toHaveLength(1);
    expect(longFieldChunks([entity('a', long('river'))], [type('hidden')])).toEqual([]);
    expect(longFieldChunks([entity('a', 'short')], [type('read')])).toEqual([]);
    expect(longFieldChunks([entity('a', long('river'), 'scrapped')], [type('read')])).toEqual([]);
    expect(longFieldChunks([entity('a', long('river'))], [type('read', true)])).toEqual([]);
  });

  it('scores similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(keywordScore('the river flows', 'river river stone')).toBeGreaterThan(0);
    expect(keywordScore('mountain', 'river stone')).toBe(0);
  });
});

describe('relevantLongFields', () => {
  let db: Db;
  let drop: () => Promise<void>;
  let ctx: ProjectContext;
  const embedded: string[] = [];
  const embedder: ChunkEmbedder = {
    modelId: 'test',
    embed: async (texts) => {
      embedded.push(...texts);
      return {
        vectors: texts.map((t) => (t.includes('river') ? [1, 0] : [0, 1])),
        tokens: texts.length,
        costMicros: 1,
      };
    },
  };
  beforeAll(async () => {
    ({ db, drop } = await createTestDb());
    const ownerId = new ObjectId();
    const p = await createProject(db, { ownerId, name: 'W', templateKey: 'blank' });
    ctx = await openProject(db, p._id, ownerId);
  });
  afterAll(() => drop());

  it('embeds once, ranks by the query, and removes a field made hidden', async () => {
    const entities = [entity('a', long('river')), entity('b', long('stone'))];
    const first = await relevantLongFields(db, ctx, embedder, 'river', {
      entities,
      types: [type('read')],
    });
    expect(first.fields[0]).toBe(fieldRef('a', 'body'));
    expect(first).toMatchObject({ tokens: 3, costMicros: 2 });

    embedded.length = 0;
    await relevantLongFields(db, ctx, embedder, 'river', { entities, types: [type('read')] });
    expect(embedded).toEqual(['river']);

    await relevantLongFields(db, ctx, embedder, 'river', { entities, types: [type('hidden')] });
    expect(await chunks.listForKind(db, ctx.scope, 'entity')).toEqual([]);
  });

  it('does not rank skipped fields', async () => {
    const res = await relevantLongFields(db, ctx, null, 'river', {
      entities: [entity('a', long('river'))],
      types: [type('read')],
      skipFields: new Set(['body']),
    });
    expect(res.fields).toEqual([]);
  });

  it('ranks by keywords when there is no embedder', async () => {
    const res = await relevantLongFields(db, ctx, null, 'river', {
      entities: [entity('a', long('river')), entity('b', long('stone'))],
      types: [type('read')],
    });
    expect(res.fields).toEqual([fieldRef('a', 'body')]);
  });
});
