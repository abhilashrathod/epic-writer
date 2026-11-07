import { describe, expect, it } from 'vitest';
import {
  formatStoryTime,
  fromDayIndex,
  toDayIndex,
  yearLength,
  type CalendarShape,
} from './calendar';
import { DEFAULT_CALENDAR } from './create-project';

const twoEras: CalendarShape = {
  months: [
    { name: 'Thaw', days: 30 },
    { name: 'Bloom', days: 31 },
    { name: 'Frost', days: 29 },
  ],
  // "Before Crowning" counts down to day 0; "After Crowning" counts up from it.
  eras: [
    { name: 'Before Crowning', abbr: 'BC', startDay: -1_000_000, direction: -1 },
    { name: 'After Crowning', abbr: 'AC', startDay: 0, direction: 1 },
  ],
  displayFormat: '{day} {month}, {year} {era}',
};

describe('calendar', () => {
  it('maps the epoch to day 1 of year 1', () => {
    expect(fromDayIndex(DEFAULT_CALENDAR, 0)).toEqual({ eraIndex: 0, year: 1, month: 1, day: 1 });
    expect(toDayIndex(DEFAULT_CALENDAR, { eraIndex: 0, year: 2, month: 3, day: 5 })).toBe(
      360 + 60 + 4,
    );
    expect(yearLength(twoEras)).toBe(90);
  });

  it('places a second calendar on the shared timeline with its epoch offset (PR-3)', () => {
    const later = { ...twoEras, epochOffset: 90 };
    // Story day 90 is this calendar's own day 0: day 1 of year 1 AC.
    expect(fromDayIndex(later, 90)).toEqual({ eraIndex: 1, year: 1, month: 1, day: 1 });
    expect(formatStoryTime(later, { start: 90, end: null, precision: 'day' })).toBe(
      formatStoryTime(twoEras, { start: 0, end: null, precision: 'day' }),
    );
    for (let d = -200; d <= 200; d++) expect(toDayIndex(later, fromDayIndex(later, d))).toBe(d);
  });

  it('round-trips every day across a backward and a forward era', () => {
    for (let d = -400; d <= 400; d++)
      expect(toDayIndex(twoEras, fromDayIndex(twoEras, d)), `day ${d}`).toBe(d);
  });

  it('counts backward eras down toward the next era', () => {
    expect(fromDayIndex(twoEras, -1)).toEqual({ eraIndex: 0, year: 1, month: 3, day: 29 });
    expect(fromDayIndex(twoEras, -90)).toEqual({ eraIndex: 0, year: 1, month: 1, day: 1 });
    expect(fromDayIndex(twoEras, -91)).toMatchObject({ eraIndex: 0, year: 2 });
    expect(fromDayIndex(twoEras, 61)).toEqual({ eraIndex: 1, year: 1, month: 3, day: 1 });
  });

  it('counts back from year 1 before a forward-only first era', () => {
    expect(formatStoryTime(DEFAULT_CALENDAR, { start: -3600, end: null, precision: 'year' })).toBe(
      '10 before E',
    );
    expect(formatStoryTime(DEFAULT_CALENDAR, { start: -1, end: null, precision: 'year' })).toBe(
      '1 before E',
    );
  });

  it('formats by precision and ranges', () => {
    const d = toDayIndex(twoEras, { eraIndex: 1, year: 12, month: 2, day: 7 });
    expect(formatStoryTime(twoEras, { start: d, end: null, precision: 'day' })).toBe(
      '7 Bloom, 12 AC',
    );
    expect(formatStoryTime(twoEras, { start: d, end: null, precision: 'month' })).toBe(
      'Bloom 12 AC',
    );
    expect(formatStoryTime(twoEras, { start: -5, end: null, precision: 'year' })).toBe('1 BC');
    expect(formatStoryTime(twoEras, { start: d, end: null, precision: 'era' })).toBe(
      'After Crowning',
    );
    expect(formatStoryTime(twoEras, { start: 0, end: 89, precision: 'year' })).toBe('1 AC – 1 AC');
    expect(formatStoryTime(twoEras, null)).toBe('Unknown date');
  });
});
