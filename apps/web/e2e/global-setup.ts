import { ensureIndexes, getMongoClient } from '@epic/db';

/** Starts every run from an empty, indexed e2e database. */
export default async function globalSetup() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?replicaSet=rs0';
  const client = getMongoClient(uri);
  const db = client.db('epic-writer-e2e');
  await db.dropDatabase();
  await ensureIndexes(db);
  await client.close();
}
