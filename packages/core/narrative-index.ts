import type { ClientSession, Db } from 'mongodb';
import { readHeads, scenes, type FieldDef } from '@epic/db';
import type { NarrativeRefValue } from '@epic/schemas/entity-fields';
import { NARRATIVE_REF_FIELDS } from './codex-context';
import { commit, commitInSession, versionBody, type Change } from './commit';
import {
  currentNarrativeOrder,
  isNarrativeRefKind,
  labelOnlyRef,
  narrativeItems,
  resolveNarrativeRef,
  type NarrativeIndex,
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

/** The index as it will be once `changes` to the document tree are committed. */
export function applyTreeChanges(index: NarrativeIndex, changes: Change[]): NarrativeIndex {
  type Doc = NarrativeIndex['documents'][number];
  const byKey = new Map(index.documents.map((d) => [d.key, d]));
  for (const c of changes) {
    if (c.collection !== 'documents') continue;
    if (c.op === 'delete') byKey.delete(c.key);
    else {
      const key = c.key ?? 'new';
      byKey.set(key, { key, ...byKey.get(key), ...(c.data as Omit<Doc, 'key'>) });
    }
  }
  return {
    works: index.works,
    documents: [...byKey.values()],
    scenes: index.scenes.flatMap((s) => {
      const d = byKey.get(s.documentKey);
      return d ? [{ ...s, order: movedOrder(d.orderPath, s.order) }] : [];
    }),
  };
}

/** Changes that bring every stored narrative order in line with `index`. Right rows make none. */
export async function narrativeOrderChanges(
  db: Db,
  ctx: ProjectContext,
  index: NarrativeIndex,
  session: ClientSession,
): Promise<Change[]> {
  const opts = { session };
  const types = await readHeads(db, 'entityTypes', ctx.scope, {}, opts);
  const entities = await readHeads(db, 'entities', ctx.scope, {}, opts);
  const facts = await readHeads(db, 'facts', ctx.scope, {}, opts);
  const links = await readHeads(db, 'links', ctx.scope, {}, opts);
  const fieldsOf = new Map(
    types.map((t) => [t.key, t.fields.filter((f) => isNarrativeRefKind(f.kind))]),
  );
  const typeOf = new Map(entities.map((e) => [e.key, e.typeKey]));

  /** The same refs at their current orders, or null when none of them moved. */
  const refreshed = <T extends { order: string | null }>(refs: T[] = []): T[] | null => {
    let moved = false;
    const next = refs.map((r) => {
      const order = currentNarrativeOrder(r as unknown as NarrativeRefValue, index);
      if (order === r.order) return r;
      moved = true;
      return { ...r, order };
    });
    return moved ? next : null;
  };
  const refreshedValue = (kind: string, raw: unknown) => {
    const next = refreshed(narrativeItems(raw));
    return next && (kind === 'narrativeRef' ? next[0] : next);
  };

  const changes: Change[] = [];
  for (const e of entities) {
    const first = refreshed(e.firstAppearances);
    const fields = Object.fromEntries(
      (fieldsOf.get(e.typeKey) ?? []).flatMap((f) => {
        const next = refreshedValue(f.kind, e.fields[f.key]);
        return next ? [[f.key, next]] : [];
      }),
    );
    if (!first && Object.keys(fields).length === 0) continue;
    changes.push({
      op: 'update',
      collection: 'entities',
      key: e.key,
      data: {
        ...versionBody(e),
        fields: { ...e.fields, ...fields },
        firstAppearances: first ?? e.firstAppearances,
      },
    });
  }
  for (const f of facts) {
    const refs = refreshed(f.narrativeRefs);
    const def = fieldsOf.get(typeOf.get(f.entityKey) ?? '')?.find((x) => x.key === f.field);
    const value = def ? refreshedValue(def.kind, f.value) : null;
    if (!refs && !value) continue;
    changes.push({
      op: 'update',
      collection: 'facts',
      key: f.key,
      data: {
        ...versionBody(f),
        narrativeRefs: refs ?? f.narrativeRefs,
        value: value ?? f.value,
      },
    });
  }
  for (const l of links) {
    const refs = refreshed(l.narrativeRefs);
    if (!refs) continue;
    changes.push({
      op: 'update',
      collection: 'links',
      key: l.key,
      data: { ...versionBody(l), narrativeRefs: refs },
    });
  }
  return changes;
}

/** Puts each scene row under its document's current path, keeping its number. */
export async function syncSceneOrders(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
): Promise<void> {
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

/** One automatic commit bringing stored orders up to date, when any are behind. */
export async function refreshNarrativeOrders(
  db: Db,
  session: ClientSession,
  ctx: ProjectContext,
): Promise<void> {
  const index = await loadNarrativeIndex(db, ctx, session);
  const changes = await narrativeOrderChanges(db, ctx, index, session);
  if (!changes.length) return;
  await commitInSession(db, session, {
    ...ctx.scope,
    message: 'Update story reference positions',
    author: { kind: 'user', userId: ctx.userId },
    auto: true,
    changes,
  });
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
  // Links must land on current orders, so catch up on any moves made before orders were kept.
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await syncSceneOrders(db, session, ctx);
      await refreshNarrativeOrders(db, session, ctx);
    });
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
