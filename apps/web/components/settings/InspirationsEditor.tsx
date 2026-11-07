'use client';

import { useState } from 'react';
import { INSPIRATION_KINDS, type InspirationDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { useSaveSettings } from '../../lib/use-project-settings';

const box = `h-9 rounded-md bg-sunk px-2 text-sm ${focusRing}`;
const BLANK: InspirationDto = { title: '', kind: 'book', creator: '', note: '', url: '' };

/** Real-world inspirations (PR-7). They stay on the project, out of the codex graph. */
export function InspirationsEditor(props: { projectId: string; inspirations: InspirationDto[] }) {
  const [rows, setRows] = useState(props.inspirations);
  const save = useSaveSettings(props.projectId);
  const edit = (i: number, p: Partial<InspirationDto>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <section aria-label="Inspirations" className="flex max-w-3xl flex-col gap-3">
      <h2 className="text-lg font-semibold">Inspirations</h2>
      <p className="text-sm text-muted">
        Books, films, myths and art that feed this world. They aren’t part of the codex.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg bg-panel p-3">
            <div className="flex flex-wrap gap-2">
              <input
                aria-label={`Inspiration ${i + 1} title`}
                placeholder="Title"
                className={`${box} flex-1`}
                value={r.title}
                onChange={(e) => edit(i, { title: e.target.value })}
              />
              <select
                aria-label={`Inspiration ${i + 1} kind`}
                className={box}
                value={r.kind}
                onChange={(e) => edit(i, { kind: e.target.value as InspirationDto['kind'] })}
              >
                {INSPIRATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0]!.toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Inspiration ${i + 1} creator`}
                placeholder="Creator"
                className={box}
                value={r.creator}
                onChange={(e) => edit(i, { creator: e.target.value })}
              />
            </div>
            <input
              aria-label={`Inspiration ${i + 1} link`}
              placeholder="https://…"
              className={box}
              value={r.url}
              onChange={(e) => edit(i, { url: e.target.value })}
            />
            <input
              aria-label={`Inspiration ${i + 1} note`}
              placeholder="What you take from it"
              className={box}
              value={r.note}
              onChange={(e) => edit(i, { note: e.target.value })}
            />
            <Button
              className="self-start"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button onClick={() => setRows((rs) => [...rs, BLANK])}>+ Add inspiration</Button>
        <Button onClick={() => save.mutate({ inspirations: rows })} disabled={save.isPending}>
          Save inspirations
        </Button>
        {save.isSuccess && !save.isPending && <span className="text-sm text-muted">Saved.</span>}
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-bad">
          {save.error.message}
        </p>
      )}
    </section>
  );
}
