import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { readHeadByKey } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import type { AsOf } from './asof';
import { createProject } from './create-project';
import { narrativePoints, narrativeRefFilter } from './narrative-points';
import { saveWorkingText } from './save';
import { createDocument, createWork, openProject } from './works';

const at = (order: string | null, workKey: string | null = 'w'): AsOf => ({
  storyTime: null,
  workKey,
  order,
});

describe('narrativeRefFilter', () => {
  const points = new Map([
    ['early', ['0001.0001']],
    ['late', ['0001.0003']],
    ['both', ['0001.0001', '0001.0003']],
  ]);

  it('keeps items at or before the point, ignoring case and spacing', () => {
    const keep = narrativeRefFilter(points, at('0001.0002.9999'));
    expect(keep('  EARLY ')).toBe(true);
    expect(keep('late')).toBe(false);
    expect(narrativeRefFilter(points, at('0001.0001'))('early')).toBe(true);
  });

  it('keeps out what it cannot place, and a label used again later', () => {
    const keep = narrativeRefFilter(points, at('0001.0002.9999'));
    expect(keep('somewhere vague')).toBe(false);
    expect(keep('both')).toBe(false);
  });

  it('keeps everything at the end of the story', () => {
    expect(narrativeRefFilter(points, at(null))('somewhere vague')).toBe(true);
    expect(narrativeRefFilter(points, at('0001', null))('late')).toBe(true);
  });
});

describe('narrativePoints', () => {
  let db: Db;
  let drop: () => Promise<void>;
  beforeAll(async () => ({ db, drop } = await createTestDb()));
  afterAll(() => drop());

  it('places episode titles, order paths and scene headings', async () => {
    const ownerId = new ObjectId();
    const p = await createProject(db, { ownerId, name: 'W', templateKey: 'blank' });
    const ctx = await openProject(db, p._id, ownerId);
    const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
    const season = await createDocument(db, ctx, { workKey, parentKey: null });
    const key = await createDocument(db, ctx, { workKey, parentKey: season, title: 'First Oath' });
    await saveWorkingText(db, ctx, {
      documentKey: key,
      text: 'INT. PALACE - DAY [[@s:s1]]\n\nA line.',
      baseVersion: 0,
    });
    const doc = await readHeadByKey(db, 'documents', ctx.scope, key);
    const points = await narrativePoints(db, ctx, workKey);
    expect(points.get('first oath')).toEqual([doc!.orderPath]);
    expect(points.get(doc!.orderPath)).toEqual([doc!.orderPath]);
    expect(points.get('int. palace - day')?.[0]).toMatch(new RegExp(`^${doc!.orderPath}\\.`));
  });
});
