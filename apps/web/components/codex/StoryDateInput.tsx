'use client';

import {
  fromDayIndex,
  toDayIndex,
  type CalendarShape,
  type Precision,
  type StoryTimeShape,
} from '@epic/core/calendar';
import { focusRing } from '@epic/ui';

const box = `h-9 rounded-md bg-sunk px-2 text-sm ${focusRing}`;

/** A story date in the project's calendar, stored as a day index with a precision. */
export function StoryDateInput(props: {
  label: string;
  calendar: CalendarShape;
  value: StoryTimeShape | null;
  onChange: (v: StoryTimeShape | null) => void;
}) {
  const cal = props.calendar;
  const v = props.value;
  const d = v
    ? fromDayIndex(cal, v.start)
    : { eraIndex: cal.eras.length - 1, year: 1, month: 1, day: 1 };
  const precision: Precision | 'none' = v?.precision ?? 'none';
  const emit = (next: Partial<typeof d>, p: Precision | 'none' = precision) => {
    if (p === 'none') return props.onChange(null);
    const m = { ...d, ...next };
    const start = toDayIndex(cal, {
      ...m,
      month: p === 'day' || p === 'month' ? m.month : 1,
      day: p === 'day' ? m.day : 1,
    });
    props.onChange({ start, end: null, precision: p });
  };
  const showYear = precision === 'year' || precision === 'month' || precision === 'day';

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{props.label}</legend>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label={`${props.label}: precision`}
          className={box}
          value={precision}
          onChange={(e) => emit({}, e.target.value as Precision | 'none')}
        >
          <option value="none">Not set</option>
          <option value="day">Exact day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="era">Era only</option>
          <option value="unknown">Unknown</option>
        </select>
        {precision === 'day' && (
          <input
            aria-label={`${props.label}: day`}
            type="number"
            min={1}
            max={cal.months[d.month - 1]?.days ?? 31}
            className={`${box} w-20`}
            value={d.day}
            onChange={(e) => emit({ day: Number(e.target.value) || 1 })}
          />
        )}
        {(precision === 'day' || precision === 'month') && (
          <select
            aria-label={`${props.label}: month`}
            className={box}
            value={d.month}
            onChange={(e) => emit({ month: Number(e.target.value) })}
          >
            {cal.months.map((m, i) => (
              <option key={i} value={i + 1}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {showYear && (
          <input
            aria-label={`${props.label}: year`}
            type="number"
            min={1}
            className={`${box} w-24`}
            value={d.year}
            onChange={(e) => emit({ year: Math.max(1, Number(e.target.value) || 1) })}
          />
        )}
        {(showYear || precision === 'era') && (
          <select
            aria-label={`${props.label}: era`}
            className={box}
            value={d.eraIndex}
            onChange={(e) => emit({ eraIndex: Number(e.target.value) })}
          >
            {cal.eras.map((era, i) => (
              <option key={i} value={i}>
                {era.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </fieldset>
  );
}
