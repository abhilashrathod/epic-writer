'use client';

import { useMemo } from 'react';
import type { AsOf } from '@epic/core/asof';
import { formatStoryTime, type CalendarShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto, WorldDto } from '@epic/schemas/api';
import { focusRing } from '@epic/ui';
import { historyOf, holdersOver } from '../../lib/institution';

/**
 * For an institution (a dynasty, a house): who held its seats over time and a history timeline of
 * it and its members (CX-8), as of the current point.
 */
export function EntryHistory(props: {
  entry: EntityDto;
  world: WorldDto;
  types: EntityTypeDto[];
  asOf: AsOf;
  calendar: CalendarShape | null;
  onOpen: (key: string) => void;
}) {
  const { entry, world, types, asOf, calendar } = props;
  const holders = useMemo(
    () => holdersOver(world, types, entry.key, asOf),
    [world, types, entry.key, asOf],
  );
  const history = useMemo(
    () => historyOf(world, types, entry.key, asOf),
    [world, types, entry.key, asOf],
  );
  const name = (k: string) => world.entities.find((e) => e.key === k)?.name ?? '(deleted entry)';
  const day = (d: number | null, open: string) =>
    d === null
      ? open
      : calendar
        ? formatStoryTime(calendar, { start: d, end: null, precision: 'day' })
        : `day ${d}`;
  const link = (k: string) => (
    <button
      className={`underline decoration-dotted underline-offset-2 hover:text-muted ${focusRing}`}
      onClick={() => props.onOpen(k)}
    >
      {name(k)}
    </button>
  );

  return (
    <>
      <section aria-label="Throne holders over time" className="flex flex-col gap-1 text-sm">
        <h3 className="font-medium">Throne holders over time</h3>
        {holders.length === 0 ? (
          <p className="text-muted">
            No seat records this {entry.name} yet. Record changes to a ruling field on a kingdom.
          </p>
        ) : (
          <ol>
            {holders.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 py-0.5">
                {link(h.holderKey)}
                <span className="text-muted">
                  of {name(h.seatKey)}, {day(h.from, 'from the start')} – {day(h.to, 'now')}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section aria-label="History" className="flex flex-col gap-1 text-sm">
        <h3 className="font-medium">History</h3>
        {history.length === 0 ? (
          <p className="text-muted">
            Nothing dated has happened to {entry.name} or its members yet.
          </p>
        ) : (
          <ol>
            {history.map((h, i) => (
              <li key={i} className="flex gap-3 py-0.5">
                <span className="w-40 shrink-0 text-muted">{day(h.start, '')}</span>
                <button
                  className={`text-left hover:underline ${focusRing}`}
                  onClick={() => props.onOpen(h.entityKey)}
                >
                  {h.label}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
