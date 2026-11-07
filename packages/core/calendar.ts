// Pure calendar math, safe for the browser: import from '@epic/core/calendar', never the package root.
// Story time is an integer day index from the project epoch; calendars only format and parse it.

export interface CalendarShape {
  months: { name: string; days: number }[];
  eras: { name: string; abbr: string; startDay: number; direction: 1 | -1 }[];
  displayFormat: string;
  /** The story day on which this calendar's day 0 falls (PR-3: several calendars, one timeline). */
  epochOffset?: number;
}

export type Precision = 'day' | 'month' | 'year' | 'era' | 'unknown';

export interface StoryTimeShape {
  start: number;
  end: number | null;
  precision: Precision;
}

/** A date as a person reads it. `year` counts from 1 within its era. */
export interface CalendarDate {
  eraIndex: number;
  year: number;
  month: number; // 1-based
  day: number; // 1-based
}

export const yearLength = (cal: CalendarShape) => cal.months.reduce((n, m) => n + m.days, 0);

function erasSorted(cal: CalendarShape) {
  return cal.eras.map((e, i) => ({ ...e, i })).sort((a, b) => a.startDay - b.startDay);
}

/** Day index of the first day of a year (forward eras) or the last year before the next era (backward eras). */
function yearStart(cal: CalendarShape, eraIndex: number, year: number): number {
  const era = cal.eras[eraIndex];
  if (!era) throw new Error(`Unknown era ${eraIndex}`);
  const len = yearLength(cal);
  if (era.direction === 1) return era.startDay + (year - 1) * len;
  // Backward eras count down toward the next era, which begins where this one's year 1 ends.
  const sorted = erasSorted(cal);
  const next = sorted.find((e) => e.startDay > era.startDay);
  const end = next ? next.startDay : era.startDay;
  return end - year * len;
}

export function toDayIndex(cal: CalendarShape, d: CalendarDate): number {
  const before = cal.months.slice(0, d.month - 1).reduce((n, m) => n + m.days, 0);
  return yearStart(cal, d.eraIndex, d.year) + before + (d.day - 1) + (cal.epochOffset ?? 0);
}

export function fromDayIndex(cal: CalendarShape, storyDay: number): CalendarDate {
  // Eras and years are counted on the calendar's own days.
  const dayIndex = storyDay - (cal.epochOffset ?? 0);
  const len = yearLength(cal);
  const sorted = erasSorted(cal);
  // The era whose span contains the day; days before every era belong to the earliest one.
  let era = sorted[0]!;
  for (const e of sorted) if (e.startDay <= dayIndex) era = e;
  const backward = era.direction === -1;
  const next = sorted.find((e) => e.startDay > era.startDay);
  let year: number;
  if (!backward) year = Math.floor((dayIndex - era.startDay) / len) + 1;
  else year = Math.floor(((next ? next.startDay : era.startDay) - 1 - dayIndex) / len) + 1;
  let rest = dayIndex - yearStart(cal, era.i, year);
  let month = 1;
  for (const m of cal.months) {
    if (rest < m.days) break;
    rest -= m.days;
    month++;
  }
  return { eraIndex: era.i, year, month, day: rest + 1 };
}

/** Formats a story time with the calendar's display format, honouring precision. */
export function formatStoryTime(cal: CalendarShape, t: StoryTimeShape | null | undefined): string {
  if (!t || t.precision === 'unknown') return 'Unknown date';
  const one = (dayIndex: number) => {
    const d = fromDayIndex(cal, dayIndex);
    const era = cal.eras[d.eraIndex]?.abbr ?? '';
    const month = cal.months[d.month - 1]?.name ?? '';
    if (t.precision === 'era') return cal.eras[d.eraIndex]?.name ?? '';
    // Days before a forward-only first era have no year in it: count back from its year 1.
    const year = d.year > 0 ? String(d.year) : `${1 - d.year} before`;
    if (t.precision === 'year') return `${year} ${era}`.trim();
    if (t.precision === 'month') return `${month} ${year} ${era}`.trim();
    return cal.displayFormat
      .replace('{day}', String(d.day))
      .replace('{month}', month)
      .replace('{year}', year)
      .replace('{era}', era)
      .trim();
  };
  return t.end !== null && t.end !== t.start ? `${one(t.start)} – ${one(t.end)}` : one(t.start);
}
