import type { CreateIndexesOptions, Db, IndexSpecification } from 'mongodb';
import { ALL_COLLECTIONS, VERSIONED_COLLECTIONS, type CollectionName } from './collections';

interface IndexDef {
  collection: CollectionName;
  name: string;
  spec: IndexSpecification;
  options?: CreateIndexesOptions;
}

const head = { partialFilterExpression: { isHead: true } };

const versioned: IndexDef[] = VERSIONED_COLLECTIONS.flatMap((c): IndexDef[] => [
  {
    collection: c,
    name: 'version_unique',
    spec: { projectId: 1, key: 1, branchId: 1, seq: 1 },
    options: { unique: true },
  },
  { collection: c, name: 'heads', spec: { projectId: 1, branchId: 1, isHead: 1 }, options: head },
]);

export const INDEXES: IndexDef[] = [
  ...versioned,
  {
    collection: 'entities',
    name: 'type_name',
    spec: { projectId: 1, branchId: 1, typeKey: 1, name: 1 },
    options: head,
  },
  {
    collection: 'entities',
    name: 'slug_unique',
    spec: { projectId: 1, branchId: 1, slug: 1 },
    options: { unique: true, partialFilterExpression: { isHead: true, deleted: false } },
  },
  {
    collection: 'entities',
    name: 'text',
    spec: { name: 'text', aliases: 'text', summary: 'text' },
  },
  { collection: 'entities', name: 'fields_wildcard', spec: { 'fields.$**': 1 } },
  {
    collection: 'links',
    name: 'from_kind',
    spec: { projectId: 1, branchId: 1, fromKey: 1, kind: 1 },
    options: head,
  },
  {
    collection: 'links',
    name: 'to_kind',
    spec: { projectId: 1, branchId: 1, toKey: 1, kind: 1 },
    options: head,
  },
  {
    collection: 'facts',
    name: 'entity_field_time',
    spec: { projectId: 1, branchId: 1, entityKey: 1, field: 1, 'storyTime.start': 1 },
    options: head,
  },
  {
    collection: 'documents',
    name: 'tree',
    spec: { projectId: 1, branchId: 1, workKey: 1, parentKey: 1, number: 1 },
    options: head,
  },
  {
    collection: 'documentVersions',
    name: 'history',
    spec: { documentKey: 1, branchId: 1, kind: 1, createdAt: 1 },
  },
  {
    collection: 'documentVersions',
    name: 'working_unique',
    spec: { documentKey: 1, branchId: 1 },
    options: { unique: true, partialFilterExpression: { kind: 'working' } },
  },
  {
    collection: 'scenes',
    name: 'order',
    spec: { projectId: 1, branchId: 1, workKey: 1, order: 1 },
  },
  { collection: 'scenes', name: 'entities', spec: { projectId: 1, branchId: 1, entityKeys: 1 } },
  {
    collection: 'beats',
    name: 'order',
    spec: { projectId: 1, branchId: 1, workKey: 1, documentKey: 1, order: 1 },
    options: head,
  },
  {
    collection: 'commits',
    name: 'seq_unique',
    spec: { projectId: 1, seq: 1 },
    options: { unique: true },
  },
  { collection: 'commits', name: 'branch_seq', spec: { projectId: 1, branchId: 1, seq: 1 } },
  {
    collection: 'branches',
    name: 'name_unique',
    spec: { projectId: 1, name: 1 },
    options: { unique: true },
  },
  { collection: 'proposals', name: 'status', spec: { projectId: 1, branchId: 1, status: 1 } },
  {
    collection: 'continuityIssues',
    name: 'doc_status',
    spec: { projectId: 1, branchId: 1, documentKey: 1, status: 1 },
  },
  { collection: 'jobs', name: 'queue', spec: { status: 1, runAfter: 1 } },
  { collection: 'jobs', name: 'project_status_type', spec: { projectId: 1, status: 1, type: 1 } },
  { collection: 'aiUsage', name: 'project_at', spec: { projectId: 1, at: 1 } },
  {
    collection: 'chunks',
    name: 'project_branch_source',
    spec: { projectId: 1, branchId: 1, sourceKind: 1, sourceKey: 1 },
  },
  { collection: 'users', name: 'email_unique', spec: { email: 1 }, options: { unique: true } },
  {
    collection: 'users',
    name: 'github_unique',
    spec: { githubLogin: 1 },
    options: { unique: true },
  },
];

export interface EnsureResult {
  createdCollections: string[];
  skipped: string[];
}

/** Creates every collection and index. Idempotent: existing ones are left as they are. */
export async function ensureIndexes(db: Db): Promise<EnsureResult> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  const createdCollections: string[] = [];
  for (const name of ALL_COLLECTIONS) {
    if (existing.has(name)) continue;
    await db.createCollection(name);
    createdCollections.push(name);
  }
  for (const { collection, name, spec, options } of INDEXES) {
    await db.collection(collection).createIndex(spec, { ...options, name });
  }
  // Vector search indexes exist only on Atlas; a local replica set has no equivalent.
  return { createdCollections, skipped: ['chunks.embedding (Atlas vector index; local only)'] };
}
