import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import { chunks as chunkRows } from '@epic/db';
import { fieldAi, type FieldAiAccess } from '@epic/schemas';
import type { ProjectContext } from './works';

/** Structural, so core needn't depend on the AI package. */
export interface ChunkEmbedder {
  modelId: string;
  embed(texts: string[]): Promise<{
    vectors: number[][];
    tokens: number;
    costMicros: number | null;
  }>;
}

interface ChunkField {
  key: string;
  kind: string;
  timeVarying?: boolean;
  ai?: FieldAiAccess;
}
export interface ChunkableType {
  key: string;
  fields: ChunkField[];
}
export interface ChunkableEntity {
  key: string;
  typeKey: string;
  canonState: string;
  fields: Record<string, unknown>;
}
export interface WantedChunk {
  /** `<entityKey>#<fieldKey>#<n>`: the chunks row has no field column. */
  sourceKey: string;
  entityKey: string;
  fieldKey: string;
  text: string;
  hash: string;
}

/** Field values at or past this length are retrieved by relevance rather than always sent. */
export const LONG_FIELD_CHARS = 200;
const CHUNK_CHARS = 1_200;
const EMBED_BATCH = 96;
const QUERY_CHARS = 8_000;
const TOP_CHUNKS = 10;

export const fieldRef = (entityKey: string, fieldKey: string) => `${entityKey}#${fieldKey}`;

export function splitIntoChunks(text: string, max = CHUNK_CHARS): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)) {
    if (cur && cur.length + para.length + 2 > max) {
      out.push(cur);
      cur = '';
    }
    let rest = cur ? `${cur}\n\n${para}` : para;
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    cur = rest;
  }
  if (cur) out.push(cur);
  return out;
}

/** The chunks that should exist. Hidden fields, scrapped entries and changing fields never do. */
export function longFieldChunks(
  entities: ChunkableEntity[],
  types: ChunkableType[],
): WantedChunk[] {
  const typeOf = new Map(types.map((t) => [t.key, t]));
  return entities.flatMap((e) => {
    if (e.canonState === 'scrapped') return [];
    return (typeOf.get(e.typeKey)?.fields ?? []).flatMap((f) => {
      const v = e.fields[f.key];
      if (fieldAi(f) === 'hidden' || f.timeVarying) return [];
      if (typeof v !== 'string' || v.length < LONG_FIELD_CHARS) return [];
      return splitIntoChunks(v).map((text, i) => ({
        sourceKey: `${fieldRef(e.key, f.key)}#${i}`,
        entityKey: e.key,
        fieldKey: f.key,
        text,
        hash: createHash('sha256').update(text).digest('hex'),
      }));
    });
  });
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * (b[i] ?? 0);
    na += a[i]! * a[i]!;
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];

/** Word overlap, for accounts with no embedding key. */
export function keywordScore(query: string, text: string): number {
  const q = new Set(words(query));
  const all = words(text);
  return all.length ? all.filter((w) => q.has(w)).length / Math.sqrt(all.length) : 0;
}

function bestFields(scored: { chunk: WantedChunk; score: number }[]): string[] {
  const top = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_CHUNKS);
  return [...new Set(top.map((x) => fieldRef(x.chunk.entityKey, x.chunk.fieldKey)))];
}

/**
 * Brings the project's chunks in line with its long fields and ranks them against `query`,
 * returning field refs, best first. Rows that are no longer wanted (a field made hidden, say) are
 * deleted first, and only wanted rows are ever ranked.
 */
export async function relevantLongFields(
  db: Db,
  ctx: ProjectContext,
  embedder: ChunkEmbedder | null,
  query: string,
  input: {
    entities: ChunkableEntity[];
    types: ChunkableType[];
    /** Rank only these entries' fields; all are still kept in sync. */
    only?: Set<string>;
    /** Never rank these field keys, though their chunks stay stored. */
    skipFields?: Set<string>;
  },
): Promise<{ fields: string[]; tokens: number; costMicros: number | null }> {
  const wanted = longFieldChunks(input.entities, input.types);
  const ranked = wanted.filter(
    (w) => (!input.only || input.only.has(w.entityKey)) && !input.skipFields?.has(w.fieldKey),
  );
  const stored = await chunkRows.listForKind(db, ctx.scope, 'entity');
  const byKey = new Map(wanted.map((w) => [w.sourceKey, w]));
  const current = (hash: string, want?: WantedChunk) => want?.hash === hash;
  const stale = stored.filter(
    (c) =>
      !current(c.hash, byKey.get(c.sourceKey)) ||
      (embedder !== null && c.embeddingModel !== embedder.modelId),
  );
  await chunkRows.deleteByIds(
    db,
    ctx.scope,
    stale.map((c) => c._id),
  );
  if (!embedder)
    return {
      fields: bestFields(
        ranked.map((chunk) => ({ chunk, score: keywordScore(query, chunk.text) })),
      ),
      tokens: 0,
      costMicros: 0,
    };

  const staleIds = new Set(stale.map((c) => c._id.toHexString()));
  const vectors = new Map(
    stored.filter((c) => !staleIds.has(c._id.toHexString())).map((c) => [c.sourceKey, c.embedding]),
  );
  const missing = wanted.filter((w) => !vectors.has(w.sourceKey));
  let tokens = 0;
  let costMicros: number | null = 0;
  const account = (r: { tokens: number; costMicros: number | null }) => {
    tokens += r.tokens;
    costMicros = costMicros === null || r.costMicros === null ? null : costMicros + r.costMicros;
  };
  for (let i = 0; i < missing.length; i += EMBED_BATCH) {
    const batch = missing.slice(i, i + EMBED_BATCH);
    const res = await embedder.embed(batch.map((b) => b.text));
    account(res);
    await chunkRows.insertMany(
      db,
      batch.map((b, j) => {
        vectors.set(b.sourceKey, res.vectors[j]!);
        return {
          ...ctx.scope,
          sourceKind: 'entity' as const,
          sourceKey: b.sourceKey,
          text: b.text,
          embedding: res.vectors[j]!,
          embeddingModel: embedder.modelId,
          hash: b.hash,
        };
      }),
    );
  }
  if (!ranked.length) return { fields: [], tokens, costMicros };
  const q = await embedder.embed([query.slice(0, QUERY_CHARS)]);
  account(q);
  return {
    fields: bestFields(
      ranked.map((chunk) => ({
        chunk,
        score: cosine(q.vectors[0]!, vectors.get(chunk.sourceKey) ?? []),
      })),
    ),
    tokens,
    costMicros,
  };
}
