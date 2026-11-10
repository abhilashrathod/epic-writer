import type { ClientSession, Db } from 'mongodb';
import { narrativeOrder, readHeads, scenes, type FieldDef } from '@epic/db';
import { NARRATIVE_REF_FIELDS } from './codex-context';
import { commit, versionBody, type Change } from './commit';
import {
  isNarrativeRefKind,
  labelOnlyRef,
  narrativeOrderRows,
  resolveNarrativeRef,
  type NarrativeIndex,
  type NarrativeOrders,
} from './narrative-refs';
import { TYPE_CATALOGUE } from './type-catalogue';
import type { ProjectContext } from './works';

export async function loadNarrativeIndex(
  db: Db,
  ctx: ProjectContext,
  session?: ClientSession,
): Promise<NarrativeIndex> {
  const opts = session ? { session } : {};
  const works = await readHeads(db, 'works', ctx.scope, {}, opts);
  const documents = await readHeads(db, 'documents', ctx.scope, {}, opts);
  const known = new Set(documents.map((d) => d.key));
  const rows = await scenes.list(db, ctx.scope, opts);
  return { works, documents, scenes: rows.filter((s) => known.has(s.documentKey)) };
}

const movedOrder = (path: string, order: string) => `${path}.${order.split('.').pop()}`;

export async function loadNarrativeOrders(
  db: Db,
  ctx: ProjectContext,
  session?: ClientSession,
): Promise<NarrativeOrders> {
  const rows = await narrativeOrder.list(db, ctx.scope, session ? { session } : {});
  return new Map(rows.map((r) => [r.targetKey, { workKey: r.workKey, order: r.order }]));
}

/** Puts each scene row under its document's current path, keeping its number. */
async function syncSceneOrders(db: Db, session: ClientSession, ctx: ProjectContext): Promise<void> {
  const documents = await readHeads(db, 'documents', ctx.scope, {}, { session });
  const paths = new Map(documents.map((d) => [d.key, d.orderPath]));
  const rows = await scenes.list(db, ctx.scope, { session });
  const moved = rows.flatMap((s) => {
    const path = paths.get(s.documentKey);
    if (!path || movedOrder(path, s.order) === s.order) return [];
    return [{ sceneKey: s.sceneKey, documentKey: s.documentKey, order: movedOrder(path, s.order) }];
  });
  await scenes.setOrders(db, ctx.scope, moved, { session });
}

/**
 * Brings positions in line with the document tree and scene rows, inside the caller's transaction.
 * Only plain rows change, so a reorder never re-versions what points at the moved scenes.
 */
export async function syncNarrativeOrder(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
): Promise<void> {
  await syncSceneOrders(db, session, ctx);
  const index = await loadNarrativeIndex(db, ctx, session);
  await narrativeOrder.sync(db, ctx.scope, narrativeOrderRows(index), { session });
}

// Catalogue narrative fields the AI fills in. Converted fields pick this up from the catalogue.
const CATALOGUE_EXTRACT = new Set(
  TYPE_CATALOGUE.flatMap((t) => t.fields)
    .filter((f) => isNarrativeRefKind(f.kind) && f.ai === 'extract')
    .map((f) => f.key),
);

export interface NarrativeMigration {
  types: number;
  entries: number;
  linked: number;
  needsLink: number;
}

/**
 * Converts the catalogue's free-text narrative fields to `narrativeRefList`, in one commit that
 * can be undone. Each item that names one place is linked and keeps its text as the label; the
 * rest keep their text as a label only. No item is dropped. Safe to run again.
 */
export async function migrateNarrativeRefs(
  db: Db,
  ctx: ProjectContext,
): Promise<NarrativeMigration> {
  const session = db.client.startSession();
  try {
    await session.withTransaction(() => syncNarrativeOrder(db, session, ctx));
  } finally {
    await session.endSession();
  }
  const [types, entities, facts, index] = await Promise.all([
    readHeads(db, 'entityTypes', ctx.scope),
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'facts', ctx.scope),
    loadNarrativeIndex(db, ctx),
  ]);
  const counts: NarrativeMigration = { types: 0, entries: 0, linked: 0, needsLink: 0 };
  const legacy = (f: FieldDef) => f.kind === 'list' && NARRATIVE_REF_FIELDS.has(f.key);
  const convert = (raw: unknown[]) =>
    raw
      .map((item) => String(item).trim())
      .filter(Boolean)
      .map((label) => {
        const found = resolveNarrativeRef(label, index);
        counts[found.status === 'resolved' ? 'linked' : 'needsLink'] += 1;
        return found.status === 'resolved' ? { ...found.ref, label } : labelOnlyRef(label);
      });

  const changes: Change[] = [];
  for (const type of types) {
    const keys = new Set(type.fields.filter(legacy).map((f) => f.key));
    if (keys.size === 0) continue;
    counts.types += 1;
    changes.push({
      op: 'update',
      collection: 'entityTypes',
      key: type.key,
      data: {
        ...versionBody(type),
        fields: type.fields.map((f) =>
          legacy(f)
            ? {
                ...f,
                kind: 'narrativeRefList',
                ai: f.ai === 'read' && CATALOGUE_EXTRACT.has(f.key) ? 'extract' : f.ai,
              }
            : f,
        ),
      },
    });
    const ofType = entities.filter((e) => e.typeKey === type.key);
    for (const e of ofType) {
      const patch = Object.fromEntries(
        Object.entries(e.fields).flatMap(([k, v]) =>
          keys.has(k) && Array.isArray(v) ? [[k, convert(v)]] : [],
        ),
      );
      if (Object.keys(patch).length === 0) continue;
      counts.entries += 1;
      changes.push({
        op: 'update',
        collection: 'entities',
        key: e.key,
        data: { ...versionBody(e), fields: { ...e.fields, ...patch } },
      });
    }
    // A writer can mark one of these fields as changing over time.
    const owners = new Set(ofType.map((e) => e.key));
    for (const f of facts) {
      if (!owners.has(f.entityKey) || !keys.has(f.field) || !Array.isArray(f.value)) continue;
      changes.push({
        op: 'update',
        collection: 'facts',
        key: f.key,
        data: { ...versionBody(f), value: convert(f.value) },
      });
    }
  }
  if (changes.length === 0) return counts;
  await commit(db, {
    ...ctx.scope,
    message: 'Convert story references to scene links',
    author: { kind: 'user', userId: ctx.userId },
    changes,
  });
  return counts;
}
