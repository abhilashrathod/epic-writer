'use client';

import type { LevelNames } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';

const box = `h-9 min-w-0 flex-1 rounded-md bg-sunk px-2 text-sm ${focusRing}`;

/**
 * A work's structure levels, outermost first (WK-2). The last level holds the text; the ones
 * above it are containers. `locked` keeps the count fixed (the work already has documents).
 * Each row names a kind of document, not an instance, which people misread as "Season 01".
 */
export function LevelsEditor(props: {
  levels: LevelNames;
  onChange: (levels: LevelNames) => void;
  locked?: boolean;
}) {
  const { levels, onChange, locked } = props;
  const edit = (i: number, p: Partial<LevelNames[number]>) =>
    onChange(levels.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const last = levels.length - 1;
  const writeIn = levels[last]?.plural || levels[last]?.singular || '…';
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">Structure levels</legend>
      <p className="text-xs text-muted">
        Name each kind of part, outermost first. You write in the last level; the levels above
        group it. You add the actual parts (Season 1, Episode 1, …) after creating the work.
      </p>
      <p className="mb-1 text-sm">
        {levels.map((l) => l.singular || '…').join(' → ')}
        <span className="text-muted"> · you write in {writeIn.toLowerCase()}</span>
      </p>
      <div className="flex items-center gap-2 text-xs text-muted" aria-hidden>
        <span className="flex-1 px-2">Name</span>
        <span className="flex-1 px-2">Plural</span>
        {!locked && <span className="invisible px-2 text-sm font-medium">Remove</span>}
      </div>
      {levels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`Level ${i + 1} name`}
            placeholder={i === last ? 'Episode' : 'Season'}
            className={box}
            value={l.singular}
            onChange={(e) => edit(i, { singular: e.target.value })}
          />
          <input
            aria-label={`Level ${i + 1} plural`}
            placeholder={i === last ? 'Episodes' : 'Seasons'}
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
