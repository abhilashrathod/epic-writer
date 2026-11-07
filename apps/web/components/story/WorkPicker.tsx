'use client';

import { focusRing } from '@epic/ui';
import type { WorkDto } from '@epic/schemas/api';

/** Picks the work a view shows. Hidden when there is only one. */
export function WorkPicker(props: {
  works: WorkDto[];
  current: string;
  onPick: (workKey: string) => void;
}) {
  if (props.works.length < 2) return null;
  return (
    <nav aria-label="Works" className="flex flex-wrap gap-1">
      {props.works.map((w) => (
        <button
          key={w.key}
          onClick={() => props.onPick(w.key)}
          aria-pressed={w.key === props.current}
          className={`rounded-md px-3 py-1.5 text-sm ${focusRing} ${w.key === props.current ? 'bg-selected text-on-selected' : 'text-muted hover:bg-sunk hover:text-ink'}`}
        >
          {w.name}
        </button>
      ))}
    </nav>
  );
}
