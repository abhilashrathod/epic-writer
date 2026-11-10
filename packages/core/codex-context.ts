// Pure: turns the codex into compact text cards for an AI prompt, resolved "as of" a point (AI-8).
// Only what applies at that point goes in, so an answer can't leak what the reader hasn't reached.

import {
  describeNarrativeRef,
  isNarrativeRefKind,
  narrativeItems,
  narrativeRefReached,
  placedRef,
  type NarrativeOrders,
  type NarrativeIndex,
} from './narrative-refs';
import { lifeAt, lifeFields, resolveFields, timedStatus, type AsOf } from './asof';
import { fieldAi, type FieldAiAccess } from '@epic/schemas';
import { formatStoryTime, type CalendarShape, type StoryTimeShape } from './calendar';
import { fieldRef, LONG_FIELD_CHARS } from './chunks';

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
  fields: {
    key: string;
    label: string;
    kind: string;
    timeVarying?: boolean;
    ai?: FieldAiAccess;
  }[];
}

export interface ContextLinkType {
  key: string;
  label: string;
  inverseLabel: string;
  symmetric: boolean;
}

const NO_ORDERS: NarrativeOrders = new Map();

export interface CodexContextInput {
  /** Names places in the story. */
  narrative?: NarrativeIndex;
  orders?: NarrativeOrders;
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
const NOTE_MAX = 120;
/** The writer's planned outcomes. Ask leaves them out unless the question opts in. */
export const PLANNED_FIELDS = new Set([
  'fate',
  'trueMeaning',
  'payoff',
  'answer',
  'writerSNote',
  'arcSummary',
  'turningPoints',
]);
/** Catalogue fields that name places in a work. A project not yet migrated has them as lists. */
export const NARRATIVE_REF_FIELDS = new Set([
  'shownOnScreen',
  'plantedNarrative',
  'hinted',
  'keyScenes',
  'appearances',
  'plantedAt',
  'hintsReminders',
  'paidOffAt',
  'raisedAt',
  'answeredAt',
  'revealedToAudienceAt',
]);
const CHARS_PER_TOKEN = 4;
/** Room for optional fields on a card. Entries the question is about get more. */
const CARD_TOKENS = 400;
const FOCUS_CARD_TOKENS = 2_000;

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
  opts: {
    maxCards?: number;
    maxChars?: number;
    relevantFields?: string[];
    excludePlanned?: boolean;
  } = {},
): CodexCard[] {
  const { maxCards = 40, maxChars = 24_000 } = opts;
  const relevance = new Map((opts.relevantFields ?? []).map((ref, i) => [ref, i]));
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
    if (e.summary) lines.push(`Summary: ${e.summary}`);
    let hidden: string | undefined;
    if (type?.traits.includes('born')) {
      const life = lifeAt(input.calendar, type.fields, values, asOf.storyTime);
      lines.push(
        `Life: ${life.status === 'unborn' ? 'not yet born' : life.status}${life.age === null ? '' : `, age ${life.age}`}`,
      );
      // A death date after this point would give away the future.
      if (life.status !== 'dead') hidden = lifeFields(type.fields).died;
    }
    const shown = (type?.fields ?? []).flatMap((f) => {
      if (f.key === hidden || fieldAi(f) === 'hidden') return [];
      if (opts.excludePlanned && PLANNED_FIELDS.has(f.key)) return [];
      const raw = values[f.key];
      const refs =
        isNarrativeRefKind(f.kind) || (f.kind === 'list' && NARRATIVE_REF_FIELDS.has(f.key))
          ? narrativeItems(raw)
              .map((r) => placedRef(r, input.orders ?? NO_ORDERS))
              .filter((r) => !opts.excludePlanned || narrativeRefReached(r, asOf))
          : null;
      const v = refs
        ? refs.map((r) => describeNarrativeRef(r, input.narrative)).join(', ') || null
        : formatValue(f.kind, raw, input, names);
      if (v === null) return [];
      const rank = relevance.get(fieldRef(e.key, f.key));
      return [{ f, v, rank, text: `${f.label}: ${v}` }];
    });
    const always = shown.filter((x) => x.f.timeVarying);
    const optional = shown.filter((x) => !x.f.timeVarying);
    // Only values this long are chunked, so only they can be ranked as relevant.
    const isLong = (x: (typeof shown)[number]) => x.v.length >= LONG_FIELD_CHARS;
    const short = optional.filter((x) => !isLong(x));
    const long = optional.filter(isLong);
    const relevant = long.filter((x) => x.rank !== undefined).sort((a, b) => a.rank! - b.rank!);
    const focused = named.has(e.key) || relevant.length > 0;
    let room = (focused ? FOCUS_CARD_TOKENS : CARD_TOKENS) * CHARS_PER_TOKEN;
    const kept = [...short, ...relevant].filter((x) => {
      if (x.text.length > room) return false;
      room -= x.text.length;
      return true;
    });
    const included = new Set(kept);
    const omitted = optional.filter((x) => !included.has(x));
    if (always.length || kept.length)
      lines.push(`Fields: ${[...always, ...kept].map((x) => x.text).join('; ')}`);
    if (omitted.length)
      lines.push(`Also on file, not shown: ${omitted.map((x) => x.f.label).join(', ')}`);
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
