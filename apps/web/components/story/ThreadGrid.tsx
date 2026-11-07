'use client';

import { TYPE_BG, focusRing } from '@epic/ui';
import type { DocumentDto } from '@epic/schemas/api';
import type { SceneDto, StorylineDto } from '@epic/schemas/storylines';

/** A thread is going cold after this many written episodes in a row without it. */
const COLD_AFTER = 2;

/**
 * Threads × episodes (GR-7): how many of each thread's scenes fall in each episode. Runs of
 * episodes without a thread, once it has started, are shaded so a thread going cold stands out.
 * Only episodes up to the last one with any scene count as written.
 */
export function ThreadGrid(props: {
  storylines: StorylineDto[];
  episodes: DocumentDto[];
  scenes: SceneDto[];
  selectedThread: string | null;
  selectedEpisode: string | null;
  onThread: (key: string) => void;
  onEpisode: (key: string) => void;
}) {
  const { episodes, scenes } = props;
  const index = new Map(episodes.map((e, i) => [e.key, i]));
  const written = Math.max(-1, ...scenes.map((s) => index.get(s.documentKey) ?? -1));

  const rows = props.storylines.map((t) => {
    const counts = episodes.map(() => 0);
    for (const s of scenes) {
      const i = index.get(s.documentKey);
      if (i !== undefined && s.storylineKeys.includes(t.key)) counts[i]!++;
    }
    const first = counts.findIndex((n) => n > 0);
    const last = counts.findLastIndex((n) => n > 0);
    // Mark each empty cell that sits in a long enough gap after the thread began.
    const cold = counts.map(() => false);
    for (let i = Math.max(first, 0); first >= 0 && i <= written;) {
      if (counts[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j <= written && !counts[j]) j++;
      if (j - i >= COLD_AFTER) for (let k = i; k < j; k++) cold[k] = true;
      i = j;
    }
    return { t, counts, cold, goingCold: first >= 0 && written - last >= COLD_AFTER };
  });

  return (
    <div className="overflow-x-auto rounded-xl bg-surface p-2">
      <table aria-label="Storylines by episode" className="w-full border-separate border-spacing-1">
        <thead>
          <tr>
            <th scope="col" className="px-2 text-left text-xs font-medium text-faint">
              Storyline
            </th>
            {episodes.map((e) => (
              <th key={e.key} scope="col" className="min-w-16 font-normal">
                <button
                  onClick={() => props.onEpisode(e.key)}
                  aria-pressed={props.selectedEpisode === e.key}
                  title={`Tag the scenes of ${e.title}`}
                  className={`w-full truncate rounded-md px-2 py-1 text-xs ${focusRing} ${props.selectedEpisode === e.key ? 'bg-selected text-on-selected' : 'text-muted hover:bg-sunk hover:text-ink'}`}
                >
                  {e.title}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, counts, cold, goingCold }) => (
            <tr key={t.key}>
              <th scope="row" className="text-left font-normal">
                <button
                  onClick={() => props.onThread(t.key)}
                  aria-pressed={props.selectedThread === t.key}
                  className={`flex w-full min-w-44 items-center gap-2 rounded-md px-2 py-1.5 text-sm ${focusRing} ${props.selectedThread === t.key ? 'bg-selected text-on-selected' : 'hover:bg-sunk'}`}
                >
                  <span className={`size-2.5 shrink-0 rounded-full ${TYPE_BG[t.color]}`} />
                  <span className="truncate">{t.name}</span>
                  {goingCold && (
                    <span
                      className={`ml-auto shrink-0 text-xs ${props.selectedThread === t.key ? '' : 'text-warn'}`}
                    >
                      Going cold
                    </span>
                  )}
                </button>
              </th>
              {counts.map((n, i) => (
                <td
                  key={episodes[i]!.key}
                  aria-label={`${t.name}, ${episodes[i]!.title}: ${n} ${n === 1 ? 'scene' : 'scenes'}`}
                  className={`h-8 rounded-md text-center text-sm tabular-nums ${n ? 'bg-sunk font-medium' : cold[i] ? 'bg-warn-soft text-warn' : 'text-faint'}`}
                >
                  {n || '·'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
