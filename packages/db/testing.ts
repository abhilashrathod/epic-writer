import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { getMongoClient } from './client';
import { ensureIndexes } from './indexes';

/** A fresh, indexed database for one test file. Call `drop()` in afterAll. */
export async function createTestDb(): Promise<{ db: Db; drop: () => Promise<void> }> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set for tests');
  const db = getMongoClient(uri).db(`test-${randomUUID().slice(0, 8)}`);
  await ensureIndexes(db);
  return { db, drop: async () => void (await db.dropDatabase()) };
}
