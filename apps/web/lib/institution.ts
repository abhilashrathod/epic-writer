// Dynasty and kingdom page views (CX-8, CX-9), worked out from traits and field definitions, never
// type names. Everything resolves "as of" through @epic/core/asof, like the graph views.

import { hasHappened, lifeFields, timedStatus, type AsOf } from '@epic/core/asof';
import type { StoryTimeShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto, WorldDto } from '@epic/schemas/api';

type Field = EntityTypeDto['fields'][number];

/** A field's value from `from` on (null: from the start). */
interface Segment {
  from: number | null;
  value: unknown;
}

export interface HolderRow {
  /** The entry whose field records the holder, e.g. a kingdom. */
  seatKey: string;
  holderKey: string;
  from: number | null;
  to: number | null;
}

export interface HistoryItem {
  start: number;
  label: string;
  entityKey: string;
}

const isTime = (v: unknown): v is StoryTimeShape =>
  !!v && typeof v === 'object' && typeof (v as StoryTimeShape).start === 'number';

/** A time-varying field over story time: the starting value, then each change that applies. */
export function fieldSegments(
  entity: EntityDto,
  facts: WorldDto['facts'],
  field: string,
  asOf: AsOf,
): Segment[] {
  const changes = facts
    .filter((f) => f.entityKey === entity.key && f.field === field)
    .filter((f) => timedStatus(f, asOf) === 'past')
    .sort((a, b) => a.storyTime.start - b.storyTime.start)
    .map((f) => ({ from: f.storyTime.start, value: f.value }));
  return [{ from: null, value: entity.fields[field] ?? null }, ...changes];
}

const valueAt = (segs: Segment[], t: number | null) => {
  let v: unknown = null;
  for (const s of segs) if (s.from === null || (t !== null && s.from <= t)) v = s.value;
  return v;
};

const refFields = (type: EntityTypeDto | undefined, pointsAt: (refs: string[]) => boolean) =>
  (type?.fields ?? []).filter(
    (f: Field) => f.timeVarying && f.kind === 'entityRef' && pointsAt(f.refTypeKeys),
  );

/**
 * Who held the seat while `institutionKey` held it (CX-8 "throne holders over time"): for every
 * entry with a time-varying reference to the institution's type (a kingdom's ruling dynasty) and
 * one to a `born` type (its ruler), the ruler during the periods the institution ruled.
 */
export function holdersOver(
  world: WorldDto,
  types: EntityTypeDto[],
  institutionKey: string,
  asOf: AsOf,
): HolderRow[] {
  const typeOf = new Map(types.map((t) => [t.key, t]));
  const inst = world.entities.find((e) => e.key === institutionKey);
  if (!inst) return [];
  const born = new Set(types.filter((t) => t.traits.includes('born')).map((t) => t.key));
  const rows: HolderRow[] = [];
  for (const seat of world.entities) {
    if (seat.canonState === 'scrapped') continue;
    const type = typeOf.get(seat.typeKey);
    const by = refFields(type, (refs) => refs.includes(inst.typeKey))[0];
    const holder = refFields(type, (refs) => refs.some((r) => born.has(r)))[0];
    if (!by || !holder) continue;
    const bySegs = fieldSegments(seat, world.facts, by.key, asOf);
    const holderSegs = fieldSegments(seat, world.facts, holder.key, asOf);
    const points = [...new Set([...bySegs, ...holderSegs].map((s) => s.from))].sort(
      (a, b) => (a ?? -Infinity) - (b ?? -Infinity),
    );
    points.forEach((from, i) => {
      const to = points[i + 1] ?? null;
      const who = valueAt(holderSegs, from);
      if (valueAt(bySegs, from) !== institutionKey || typeof who !== 'string') return;
      const last = rows.at(-1);
      if (last && last.seatKey === seat.key && last.holderKey === who && last.to === from)
        last.to = to;
      else rows.push({ seatKey: seat.key, holderKey: who, from, to });
    });
  }
  return rows.sort((a, b) => (a.from ?? -Infinity) - (b.from ?? -Infinity));
}

/** Keys of entries linked to `key` by a membership link that applies as of now. */
export function membersOf(world: WorldDto, key: string, asOf: AsOf): string[] {
  return world.links
    .filter((l) => l.kind === 'membership' && l.toKey === key && timedStatus(l, asOf) === 'past')
    .map((l) => l.fromKey);
}

/**
 * A history timeline for an entry and its members (CX-8): events that name them, members' births
 * and deaths, and recorded changes that point at the entry. Only what has happened as of now.
 */
export function historyOf(
  world: WorldDto,
  types: EntityTypeDto[],
  key: string,
  asOf: AsOf,
): HistoryItem[] {
  const typeOf = new Map(types.map((t) => [t.key, t]));
  const nameOf = new Map(world.entities.map((e) => [e.key, e.name]));
  const circle = new Set([key, ...membersOf(world, key, asOf)]);
  const items: HistoryItem[] = [];
  const add = (t: unknown, label: string, entityKey: string) => {
    if (isTime(t) && t.precision !== 'unknown' && hasHappened(t, asOf))
      items.push({ start: t.start, label, entityKey });
  };

  for (const e of world.entities) {
    if (e.canonState === 'scrapped') continue;
    const type = typeOf.get(e.typeKey);
    if (!type) continue;
    if (type.traits.includes('event')) {
      const names = type.fields.some((f) => {
        const v = e.fields[f.key];
        return (
          (f.kind === 'entityRef' && typeof v === 'string' && circle.has(v)) ||
          (f.kind === 'entityRefList' && Array.isArray(v) && v.some((k) => circle.has(k)))
        );
      });
      const when = type.fields.find((f) => f.kind === 'date');
      if (names && when) add(e.fields[when.key], e.name, e.key);
    }
    if (circle.has(e.key) && e.key !== key && type.traits.includes('born')) {
      const { born, died } = lifeFields(type.fields);
      if (born) add(e.fields[born], `${e.name} is born`, e.key);
      if (died) add(e.fields[died], `${e.name} dies`, e.key);
    }
  }
  for (const f of world.facts) {
    if (f.value !== key || timedStatus(f, asOf) !== 'past') continue;
    const owner = world.entities.find((e) => e.key === f.entityKey);
    const field = owner && typeOf.get(owner.typeKey)?.fields.find((x) => x.key === f.field);
    if (owner && field)
      add(
        f.storyTime,
        `${owner.name}: ${field.label.toLowerCase()} becomes ${nameOf.get(key)}`,
        owner.key,
      );
  }
  return items.sort((a, b) => a.start - b.start);
}
