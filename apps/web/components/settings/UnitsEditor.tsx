'use client';

import { useState } from 'react';
import type { UnitDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { useSaveSettings } from '../../lib/use-project-settings';
import { fieldKeyFrom } from '../../lib/use-types';

const box = `h-9 w-full rounded-md bg-sunk px-2 text-sm ${focusRing}`;

interface Row {
  key: string;
  name: string;
  abbr: string;
  size: string;
}

const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(6)).toLocaleString() : '—');

/**
 * Units of distance (PR-4). Each unit's size is given in a shared base, so any two convert;
 * the first unit's conversions are shown as a check.
 */
export function UnitsEditor({ projectId, units }: { projectId: string; units: UnitDto[] }) {
  const [rows, setRows] = useState<Row[]>(
    units.map((u) => ({ key: u.key, name: u.name, abbr: u.abbr, size: String(u.toBase) })),
  );
  const save = useSaveSettings(projectId);
  const edit = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const first = rows[0];

  const submit = () => {
    const used = new Set(rows.map((r) => r.key).filter(Boolean));
    const units = rows.map((r) => {
      const key = r.key || fieldKeyFrom(r.name || 'unit', used);
      used.add(key);
      return { key, name: r.name, abbr: r.abbr, toBase: Number(r.size) };
    });
    save.mutate({ units });
  };

  return (
    <section aria-label="Units" className="flex max-w-2xl flex-col gap-3">
      <h2 className="text-lg font-semibold">Units of distance</h2>
      <p className="text-sm text-muted">
        Give every unit’s size in the same base (for example metres). Entries with distances use
        these units.
      </p>
      <table className="text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th className="pb-1 font-medium">Name</th>
            <th className="pb-1 font-medium">Abbreviation</th>
            <th className="pb-1 font-medium">Size in base</th>
            {first && <th className="pb-1 font-medium">In {first.name || 'first unit'}</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="pr-2 pb-1">
                <input
                  aria-label={`Unit ${i + 1} name`}
                  className={box}
                  value={r.name}
                  onChange={(e) => edit(i, { name: e.target.value })}
                />
              </td>
              <td className="pr-2 pb-1">
                <input
                  aria-label={`Unit ${i + 1} abbreviation`}
                  className={box}
                  value={r.abbr}
                  onChange={(e) => edit(i, { abbr: e.target.value })}
                />
              </td>
              <td className="pr-2 pb-1">
                <input
                  aria-label={`Unit ${i + 1} size`}
                  type="number"
                  min="0"
                  step="any"
                  className={box}
                  value={r.size}
                  onChange={(e) => edit(i, { size: e.target.value })}
                />
              </td>
              {first && (
                <td className="pr-2 pb-1 text-muted">
                  {fmt(Number(r.size) / Number(first.size))} {first.abbr}
                </td>
              )}
              <td className="pb-1">
                <Button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button
          onClick={() => setRows((rs) => [...rs, { key: '', name: '', abbr: '', size: '1' }])}
        >
          + Add unit
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          Save units
        </Button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-bad">
          {save.error.message}
        </p>
      )}
      {save.isSuccess && !save.isPending && <p className="text-sm text-muted">Units saved.</p>}
    </section>
  );
}
