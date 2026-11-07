'use client';

import { useState } from 'react';
import { END_OF_TIME, formatPoint, pointPrecision } from '@epic/core/asof';
import type { StoryTimeShape } from '@epic/core/calendar';
import { Button } from '@epic/ui';
import { useTree } from '../lib/use-tree';
import { useTypes } from '../lib/use-types';
import { StoryDateInput } from './codex/StoryDateInput';
import { useWorkspace } from './Workspace';

/** The point in the story every time-aware view resolves to (GR-5), with a pin (WK-7). */
export function AsOfControl() {
  const { projectId, asOf, setAsOf, asOfPinned, setAsOfPinned } = useWorkspace();
  const calendar = useTypes(projectId).data?.calendar ?? null;
  const tree = useTree(projectId);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<StoryTimeShape | null>(null);

  const when =
    asOf.storyTime === null
      ? 'End of story'
      : calendar
        ? formatPoint(calendar, asOf.storyTime)
        : `Day ${asOf.storyTime}`;
  const episodePath = asOf.order?.replace(/\.9999$/, '');
  const episode = tree.data?.documents.find(
    (d) => d.workKey === asOf.workKey && d.orderPath === episodePath,
  );
  const work = tree.data?.works.find((w) => w.key === asOf.workKey);

  function startPicking() {
    const t = asOf.storyTime;
    setDraft(
      calendar && t !== null
        ? { start: t, end: null, precision: pointPrecision(calendar, t) }
        : null,
    );
    setPicking(!picking);
  }

  return (
    <section aria-label="As of" className="flex flex-col gap-1 rounded-lg bg-surface p-2 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-faint">As of</span>
        <span className="min-w-0 flex-1 truncate font-medium" aria-live="polite">
          {when}
        </span>
      </div>
      {episode && (
        <p className="truncate text-xs text-muted">
          {work ? `${work.name} · ` : ''}
          {episode.title}
        </p>
      )}
      <div className="flex flex-wrap gap-x-1">
        {calendar && (
          <Button className="h-7" onClick={startPicking} aria-expanded={picking}>
            Pick a date…
          </Button>
        )}
        {asOf.storyTime !== null || asOf.workKey ? (
          <Button className="h-7" onClick={() => setAsOf(END_OF_TIME)}>
            End of story
          </Button>
        ) : null}
        <Button
          className="h-7"
          aria-pressed={asOfPinned}
          title="A pinned point stays put when you open an episode"
          onClick={() => setAsOfPinned(!asOfPinned)}
        >
          {asOfPinned ? 'Pinned' : 'Pin'}
        </Button>
      </div>
      {picking && calendar && (
        <StoryDateInput
          label="Story date"
          calendar={calendar}
          value={draft}
          onChange={(v) => {
            setDraft(v);
            setAsOf({
              storyTime: v && v.precision !== 'unknown' ? v.start : null,
              workKey: null,
              order: null,
            });
          }}
        />
      )}
    </section>
  );
}
