// Pure: turns the codex into compact text cards for an AI prompt, resolved "as of" a point (AI-8).
// Only what applies at that point goes in, so an answer can't leak what the reader hasn't reached.

import { lifeAt, lifeFields, resolveFields, timedStatus, type AsOf } from './asof';
import { formatStoryTime, type CalendarShape, type StoryTimeShape } from './calendar';

interface Ref {
  workKey: string;
  order: string;
}

export interface ContextEntity {
  key: string;
  typeKey: string;
  name: string;
  aliases: string[];
  summary: string;
  prominence: string;
  canonState: string;
  fields: Record<string, unknown>;
}

export interface ContextLink {
  typeKey: string;
  fromKey: string;
  toKey: string;
  note: string;
  canonState: string;
  storyTime: StoryTimeShape | null;
  narrativeRefs: Ref[];
}

export interface ContextFact {
  key: string;
  entityKey: string;
  field: string;
  value: unknown;
  canonState: string;
  storyTime: StoryTimeShape;
  narrativeRefs: Ref[];
}

export interface ContextType {
  key: string;
  name: string;
  traits: string[];
  fields: { key: string; label: string; kind: string }[];
}

export interface ContextLinkType {
  key: string;
  label: string;
  inverseLabel: string;
  symmetric: boolean;
}

export interface CodexContextInput {
  entities: ContextEntity[];
  links: ContextLink[];
  facts: ContextFact[];
  types: ContextType[];
  linkTypes: ContextLinkType[];
  calendar: CalendarShape | null;
  units?: { key: string; abbr: string }[];
}

export interface CodexCard {
  key: string;
  name: string;
  text: string;
}

const PROMINENCE_RANK: Record<string, number> = { main: 0, supporting: 1, minor: 2, background: 3 };
const SUMMARY_MAX = 600;
const VALUE_MAX = 200;
const NOTE_MAX = 120;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function groupBy<T>(items: T[], keys: (x: T) => string[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const x of items)
    for (const k of keys(x)) {
      const list = out.get(k);
      if (list) list.push(x);
      else out.set(k, [x]);
    }
  return out;
}

/** Whether `name` appears in `text` as whole words, ignoring case. */
export function mentions(text: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function formatValue(
  kind: string,
  v: unknown,
  input: CodexContextInput,
  names: Map<string, string>,
): string | null {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
    return null;
  switch (kind) {
    case 'image':
      return null;
    case 'date': {
      const t = v as StoryTimeShape;
      return input.calendar ? formatStoryTime(input.calendar, t) : `day ${t.start}`;
    }
    case 'entityRef':
      return names.get(String(v)) ?? null;
    case 'entityRefList': {
      const list = (v as unknown[]).map((k) => names.get(String(k))).filter(Boolean);
      return list.length ? list.join(', ') : null;
    }
    case 'quantity': {
      const q = v as { value: number; unitKey: string };
      const unit = input.units?.find((u) => u.key === q.unitKey)?.abbr ?? q.unitKey;
      return `${q.value} ${unit}`;
    }
    case 'boolean':
      return v ? 'yes' : 'no';
    default:
      if (Array.isArray(v)) return v.map(String).join(', ');
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

/**
 * Compact text cards for the codex as of `asOf`, most relevant to `question` first: entries named
 * in the question, then their connections, then by prominence. Scrapped data and links or facts
 * that haven't happened or been revealed by that point are left out. Stops at `maxCards` cards or
 * `maxChars` characters, whichever comes first.
 */
export function buildCodexContext(
  input: CodexContextInput,
  asOf: AsOf,
  question: string,
  opts: { maxCards?: number; maxChars?: number } = {},
): CodexCard[] {
  const { maxCards = 40, maxChars = 24_000 } = opts;
  const entities = input.entities.filter((e) => e.canonState !== 'scrapped');
  const names = new Map(entities.map((e) => [e.key, e.name]));
  const types = new Map(input.types.map((t) => [t.key, t]));
  const linkTypes = new Map(input.linkTypes.map((t) => [t.key, t]));
  const links = input.links.filter(
    (l) => names.has(l.fromKey) && names.has(l.toKey) && timedStatus(l, asOf) === 'past',
  );
  // resolveFields ignores facts that don't apply; scrapped ones never do.
  const factsBy = groupBy(input.facts, (f) => [f.entityKey]);
  const linksBy = groupBy(links, (l) => [l.fromKey, l.toKey]);

  const named = new Set(
    entities
      .filter((e) => [e.name, ...e.aliases].some((n) => mentions(question, n)))
      .map((e) => e.key),
  );
  const near = new Set<string>();
  for (const l of links) {
    if (named.has(l.fromKey)) near.add(l.toKey);
    if (named.has(l.toKey)) near.add(l.fromKey);
  }
  const tier = (k: string) => (named.has(k) ? 0 : near.has(k) ? 1 : 2);
  const ranked = [...entities].sort(
    (a, b) =>
      tier(a.key) - tier(b.key) ||
      (PROMINENCE_RANK[a.prominence] ?? 4) - (PROMINENCE_RANK[b.prominence] ?? 4) ||
      a.name.localeCompare(b.name),
  );

  function card(e: ContextEntity): string {
    const type = types.get(e.typeKey);
    const values = resolveFields(e.fields, factsBy.get(e.key) ?? [], asOf);
    const lines = [
      `[${e.key}] ${e.name} (${type?.name ?? 'Entry'})${e.aliases.length ? ` — also ${e.aliases.join(', ')}` : ''}`,
    ];
    if (e.summary) lines.push(`Summary: ${clip(e.summary, SUMMARY_MAX)}`);
    let hidden: string | undefined;
    if (type?.traits.includes('born')) {
      const life = lifeAt(input.calendar, type.fields, values, asOf.storyTime);
      lines.push(
        `Life: ${life.status === 'unborn' ? 'not yet born' : life.status}${life.age === null ? '' : `, age ${life.age}`}`,
      );
      // A death date after this point would give away the future.
      if (life.status !== 'dead') hidden = lifeFields(type.fields).died;
    }
    const fields = (type?.fields ?? [])
      .filter((f) => f.key !== hidden)
      .map((f) => {
        const v = formatValue(f.kind, values[f.key], input, names);
        return v === null ? null : `${f.label}: ${clip(v, VALUE_MAX)}`;
      })
      .filter(Boolean);
    if (fields.length) lines.push(`Fields: ${fields.join('; ')}`);
    const conns = (linksBy.get(e.key) ?? []).map((l) => {
      const lt = linkTypes.get(l.typeKey);
      const out = l.fromKey === e.key;
      const other = out ? l.toKey : l.fromKey;
      const label = (out || lt?.symmetric ? lt?.label : lt?.inverseLabel) ?? 'connected to';
      const note = l.note ? ` (${clip(l.note, NOTE_MAX)})` : '';
      return `${label} ${names.get(other)} [${other}]${note}`;
    });
    if (conns.length) lines.push(`Connections: ${conns.join('; ')}`);
    return lines.join('\n');
  }

  const cards: CodexCard[] = [];
  let size = 0;
  for (const e of ranked) {
    if (cards.length >= maxCards || maxChars - size < 100) break;
    const text = card(e);
    if (size + text.length > maxChars) {
      // A long card may not fit while shorter ones still do; keep going rather than stop.
      continue;
    }
    size += text.length + 2;
    cards.push({ key: e.key, name: e.name, text });
  }
  return cards;
}
