import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { ALL_COLLECTIONS } from './collections';
import { ensureIndexes, INDEXES } from './indexes';
import { createTestDb } from './testing';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());

describe('ensureIndexes', () => {
  it('creates all 26 collections and every index', async () => {
    expect(ALL_COLLECTIONS).toHaveLength(26);
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    expect(names.sort()).toEqual([...ALL_COLLECTIONS].sort());
    for (const { collection, name } of INDEXES) {
      const idx = await db.collection(collection).indexes();
      expect(
        idx.map((i) => i.name),
        `${collection}.${name}`,
      ).toContain(name);
    }
  });

  it('is idempotent', async () => {
    const second = await ensureIndexes(db);
    expect(second.createdCollections).toEqual([]);
  });
});
