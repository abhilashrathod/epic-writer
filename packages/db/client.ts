import { MongoClient, type Collection, type Db } from 'mongodb';
import type { CollectionDocs, CollectionName } from './collections';

// Next.js dev hot-reloads modules; keeping clients on globalThis avoids leaking a pool per reload.
const globalClients = globalThis as typeof globalThis & {
  __epicMongoClients?: Map<string, MongoClient>;
};

export function getMongoClient(uri: string): MongoClient {
  const clients = (globalClients.__epicMongoClients ??= new Map());
  let client = clients.get(uri);
  if (!client) {
    client = new MongoClient(uri);
    clients.set(uri, client);
  }
  return client;
}

export function getDb(uri: string, dbName: string): Db {
  return getMongoClient(uri).db(dbName);
}

export function col<C extends CollectionName>(db: Db, name: C): Collection<CollectionDocs[C]> {
  return db.collection<CollectionDocs[C]>(name);
}
