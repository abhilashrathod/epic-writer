import type { Db } from 'mongodb';
import { readHeads, type FieldDef } from '@epic/db';
import { NARRATIVE_REF_FIELDS } from './codex-context';
import { commit, versionBody, type Change } from './commit';
import { labelOnlyRef, resolveNarrativeRef, type NarrativeIndex } from './narrative-refs';
import { listScenes } from './storylines';
import type { ProjectContext } from './works';

export async function loadNarrativeIndex(db: Db, ctx: ProjectContext): Promise<NarrativeIndex> {
  const [works, documents, scenes] = await Promise.all([
    readHeads(db, 'works', ctx.scope),
    readHeads(db, 'documents', ctx.scope),
    listScenes(db, ctx),
  ]);
  return { works, documents, scenes };
}

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
        fields: type.fields.map((f) => (legacy(f) ? { ...f, kind: 'narrativeRefList' } : f)),
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
