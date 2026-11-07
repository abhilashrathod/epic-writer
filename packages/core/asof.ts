// Pure "as of" rules (GR-5), safe for the browser: import from '@epic/core/asof'.
// Every time-aware view resolves through these functions so they all agree.

import {
  formatStoryTime,
  fromDayIndex,
  yearLength,
  type CalendarShape,
  type StoryTimeShape,
} from './calendar';

/**
 * A point in the story. `storyTime` null means "the end of time" (everything that ever happens).
 * `workKey` + `order` is a narrative position: what the audience of that work has seen so far.
 */
export interface AsOf {
  storyTime: number | null;
  workKey: string | null;
  order: string | null;
}

export const END_OF_TIME: AsOf = { storyTime: null, workKey: null, order: null };

interface Ref {
  workKey: string;
  order: string;
}

interface Timed {
  storyTime: StoryTimeShape | null;
  narrativeRefs: Ref[];
  canonState: string;
}

/** Whether something has happened by this point in story time. Untimed things always have. */
export function hasHappened(t: StoryTimeShape | null, asOf: AsOf): boolean {
  return asOf.storyTime === null || !t || t.precision === 'unknown' || t.start <= asOf.storyTime;
}

/**
 * Whether the audience of `asOf.workKey` has been shown it by `asOf.order`. Things with no
 * reference in that work are common knowledge; otherwise the earliest reference must be reached.
 */
export function isRevealed(refs: Ref[], asOf: AsOf): boolean {
  if (!asOf.workKey || asOf.order === null) return true;
  const inWork = refs.filter((r) => r.workKey === asOf.workKey).map((r) => r.order);
  return inWork.length === 0 || inWork.some((o) => o <= asOf.order!);
}

/** 'past' if it applies at this point; 'future' if it exists but hasn't happened or been revealed. */
export function timedStatus(x: Timed, asOf: AsOf): 'past' | 'future' | 'scrapped' {
  if (x.canonState === 'scrapped') return 'scrapped';
  return hasHappened(x.storyTime, asOf) && isRevealed(x.narrativeRefs, asOf) ? 'past' : 'future';
}

interface FactLike extends Timed {
  key: string;
  entityKey: string;
  field: string;
  value: unknown;
  storyTime: StoryTimeShape;
}

/**
 * An entry's field values as of a point: for each field, the latest fact that applies (by story
 * time, ties broken by order in `facts`), else the entry's own value, which is the starting value.
 */
export function resolveFields(
  fields: Record<string, unknown>,
  facts: FactLike[],
  asOf: AsOf,
): Record<string, unknown> {
  const out = { ...fields };
  const best = new Map<string, FactLike>();
  for (const f of facts) {
    if (timedStatus(f, asOf) !== 'past') continue;
    const cur = best.get(f.field);
    if (!cur || f.storyTime.start >= cur.storyTime.start) best.set(f.field, f);
  }
  for (const [field, f] of best) out[field] = f.value;
  return out;
}

/** Which date fields carry birth and death for a `born` type: keys `born`/`died`, else the first two dates. */
export function lifeFields(fields: { key: string; kind: string }[]): {
  born?: string;
  died?: string;
} {
  const dates = fields.filter((f) => f.kind === 'date').map((f) => f.key);
  const born = dates.includes('born') ? 'born' : dates[0];
  const died = dates.includes('died') ? 'died' : dates.find((k) => k !== born);
  return { born, died };
}

/** Whole years between a birth and a point in story time, or null if either is unknown. */
export function ageAt(
  cal: CalendarShape,
  born: StoryTimeShape | null | undefined,
  at: number | null,
): number | null {
  if (!born || born.precision === 'unknown' || born.precision === 'era' || at === null) return null;
  const years = Math.floor((at - born.start) / yearLength(cal));
  return years >= 0 ? years : null;
}

/** 'unborn' before the birth date, 'dead' after the death date, else 'alive' (or unknown dates). */
export function lifeStatus(
  born: StoryTimeShape | null | undefined,
  died: StoryTimeShape | null | undefined,
  at: number | null,
): 'unborn' | 'alive' | 'dead' {
  if (at === null) return died ? 'dead' : 'alive';
  if (born && born.precision !== 'unknown' && born.start > at) return 'unborn';
  if (died && died.precision !== 'unknown' && died.start <= at) return 'dead';
  return 'alive';
}

/**
 * Birth status and age of a `born` entry at a point. The dead keep the age they died at; with no
 * point (end of story) only that age at death is known.
 */
export function lifeAt(
  cal: CalendarShape | null,
  fieldDefs: { key: string; kind: string }[],
  values: Record<string, unknown>,
  at: number | null,
): { status: 'unborn' | 'alive' | 'dead'; age: number | null } {
  const { born, died } = lifeFields(fieldDefs);
  const b = born ? (values[born] as StoryTimeShape | null | undefined) : null;
  const d = died ? (values[died] as StoryTimeShape | null | undefined) : null;
  const status = lifeStatus(b, d, at);
  const when =
    status === 'dead'
      ? d && d.precision !== 'unknown'
        ? d.start
        : null
      : status === 'alive'
        ? at
        : null;
  return { status, age: cal ? ageAt(cal, b, when) : null };
}

/** The precision a bare day implies: a year's first day reads as the year, a month's as the month. */
export function pointPrecision(cal: CalendarShape, day: number): 'day' | 'month' | 'year' {
  const d = fromDayIndex(cal, day);
  return d.day > 1 ? 'day' : d.month > 1 ? 'month' : 'year';
}

/** A point in story time as a short date, at the precision its day implies. */
export function formatPoint(cal: CalendarShape, day: number): string {
  return formatStoryTime(cal, { start: day, end: null, precision: pointPrecision(cal, day) });
}
