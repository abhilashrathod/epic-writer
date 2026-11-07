'use client';

import type { LevelNames } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';

const box = `h-9 min-w-0 flex-1 rounded-md bg-sunk px-2 text-sm ${focusRing}`;

/**
 * A work's structure levels, outermost first (WK-2). The last level holds the text; the ones
 * above it are containers. `locked` keeps the count fixed (the work already has documents).
 */
export function LevelsEditor(props: {
  levels: LevelNames;
  onChange: (levels: LevelNames) => void;
  locked?: boolean;
}) {
  const { levels, onChange, locked } = props;
  const edit = (i: number, p: Partial<LevelNames[number]>) =>
    onChange(levels.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-medium">
        Structure: {levels.map((l) => l.singular || '…').join(' → ')}
      </legend>
      {levels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Level ${i + 1} name`}
            placeholder="Chapter"
            className={box}
            value={l.singular}
            onChange={(e) => edit(i, { singular: e.target.value })}
          />
          <input
            aria-label={`Level ${i + 1} plural`}
            placeholder="Chapters"
            className={box}
            value={l.plural}
            onChange={(e) => edit(i, { plural: e.target.value })}
          />
          {!locked && (
            <Button
              onClick={() => onChange(levels.filter((_, j) => j !== i))}
              disabled={levels.length === 1}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {!locked && levels.length < 5 && (
        <Button
          className="self-start"
          onClick={() => onChange([{ singular: '', plural: '' }, ...levels])}
        >
          + Add an outer level
        </Button>
      )}
      {locked && (
        <p className="text-xs text-muted">
          This work has documents, so levels can be renamed but not added or removed.
        </p>
      )}
    </fieldset>
  );
}
