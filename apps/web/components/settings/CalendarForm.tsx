'use client';

import { useState, type FormEvent } from 'react';
import type { CalendarInput } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';

const box = `h-9 rounded-md bg-sunk px-2 text-sm ${focusRing}`;

export const BLANK_CALENDAR: CalendarInput = {
  name: '',
  epochOffset: 0,
  months: [{ name: 'Month 1', days: 30 }],
  daysPerWeek: 7,
  weekdayNames: [],
  eras: [{ name: 'Common Era', abbr: 'CE', startDay: 0, direction: 1 }],
  displayFormat: '{day} {month} {year} {era}',
};

/**
 * One calendar (PR-3): months, weekdays, eras with direction (an era counting down suits
 * BC-style years) and the display format. `epochOffset` sets where it sits on the shared timeline.
 */
export function CalendarForm(props: {
  initial: CalendarInput;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (c: CalendarInput) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState(props.initial);
  const [weekdays, setWeekdays] = useState(props.initial.weekdayNames.join(', '));
  const patch = (p: Partial<CalendarInput>) => setC((x) => ({ ...x, ...p }));
  const month = (i: number, p: Partial<CalendarInput['months'][number]>) =>
    patch({ months: c.months.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const era = (i: number, p: Partial<CalendarInput['eras'][number]>) =>
    patch({ eras: c.eras.map((e, j) => (j === i ? { ...e, ...p } : e)) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const names = weekdays
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    props.onSubmit({
      ...c,
      weekdayNames: names,
      daysPerWeek: names.length || c.daysPerWeek,
    });
  };

  return (
    <form
      aria-label={props.submitLabel}
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-xl bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Calendar name"
          value={c.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        <Field
          label="Its day 0 falls on story day"
          type="number"
          value={c.epochOffset}
          hint="0 lines it up with the project’s timeline; other values shift it."
          onChange={(e) => patch({ epochOffset: Math.trunc(Number(e.target.value)) })}
        />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Months</legend>
        {c.months.map((m, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Month ${i + 1} name`}
              className={`${box} flex-1`}
              value={m.name}
              onChange={(e) => month(i, { name: e.target.value })}
            />
            <input
              aria-label={`Month ${i + 1} days`}
              type="number"
              min={1}
              className={`${box} w-24`}
              value={m.days}
              onChange={(e) => month(i, { days: Math.trunc(Number(e.target.value)) })}
            />
            <Button
              onClick={() => patch({ months: c.months.filter((_, j) => j !== i) })}
              disabled={c.months.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          className="self-start"
          onClick={() =>
            patch({ months: [...c.months, { name: `Month ${c.months.length + 1}`, days: 30 }] })
          }
        >
          + Add month
        </Button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Weekday names, comma-separated"
          value={weekdays}
          hint="Leave empty to use numbered days."
          onChange={(e) => setWeekdays(e.target.value)}
        />
        {!weekdays.trim() && (
          <Field
            label="Days per week"
            type="number"
            min={1}
            max={30}
            value={c.daysPerWeek}
            onChange={(e) => patch({ daysPerWeek: Math.trunc(Number(e.target.value)) })}
          />
        )}
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Eras</legend>
        {c.eras.map((x, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input
              aria-label={`Era ${i + 1} name`}
              className={`${box} flex-1`}
              value={x.name}
              onChange={(e) => era(i, { name: e.target.value })}
            />
            <input
              aria-label={`Era ${i + 1} abbreviation`}
              className={`${box} w-20`}
              value={x.abbr}
              onChange={(e) => era(i, { abbr: e.target.value })}
            />
            <input
              aria-label={`Era ${i + 1} starts on day`}
              type="number"
              className={`${box} w-32`}
              value={x.startDay}
              onChange={(e) => era(i, { startDay: Math.trunc(Number(e.target.value)) })}
            />
            <select
              aria-label={`Era ${i + 1} counting`}
              className={box}
              value={x.direction}
              onChange={(e) => era(i, { direction: Number(e.target.value) === -1 ? -1 : 1 })}
            >
              <option value={1}>Counts up</option>
              <option value={-1}>Counts down (BC-style)</option>
            </select>
            <Button
              onClick={() => patch({ eras: c.eras.filter((_, j) => j !== i) })}
              disabled={c.eras.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          className="self-start"
          onClick={() =>
            patch({
              eras: [
                ...c.eras,
                {
                  name: '',
                  abbr: '',
                  startDay: Math.min(...c.eras.map((e) => e.startDay)) - 36500,
                  direction: -1,
                },
              ],
            })
          }
        >
          + Add era
        </Button>
      </fieldset>

      <Field
        label="Display format"
        value={c.displayFormat}
        hint="Use {day}, {month}, {year} and {era}."
        onChange={(e) => patch({ displayFormat: e.target.value })}
      />

      {props.error && (
        <p role="alert" className="text-sm text-bad">
          {props.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={props.pending || !c.name.trim()}>
          {props.submitLabel}
        </Button>
        <Button onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
