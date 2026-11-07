'use client';

import Link from 'next/link';
import { TYPE_BG, focusRing } from '@epic/ui';
import type { EntityDto } from '@epic/schemas/api';
import type { SceneDto, StorylineDto } from '@epic/schemas/storylines';
import { useTagScene } from '../../lib/use-story';

/**
 * Scenes in narrative order, each linking to its place in the text, with storyline toggles and,
 * in prose, a point-of-view picker (GR-7).
 */
export function SceneList(props: {
  projectId: string;
  scenes: SceneDto[];
  storylines: StorylineDto[];
  entries: EntityDto[];
  showEpisode: boolean;
}) {
  const { projectId } = props;
  const tag = useTagScene(projectId);
  const live = props.entries.filter((e) => e.canonState !== 'scrapped');

  if (!props.scenes.length) return <p className="text-sm text-muted">No scenes here yet.</p>;
  return (
    <>
      {tag.error && (
        <p role="alert" className="text-sm text-bad">
          Couldn’t tag the scene: {tag.error.message}
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {props.scenes.map((s) => {
          const title = s.heading || 'Untitled scene';
          const mentioned = live.filter((e) => s.entityKeys.includes(e.key));
          const others = live.filter((e) => !s.entityKeys.includes(e.key));
          return (
            <li
              key={s.sceneKey}
              aria-label={title}
              className="flex flex-col gap-2 rounded-lg bg-surface p-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Link
                  href={`/projects/${projectId}/d/${s.documentKey}?scene=${s.sceneKey}`}
                  className={`font-medium hover:underline ${focusRing}`}
                >
                  {title}
                </Link>
                {props.showEpisode && <span className="text-sm text-muted">{s.documentTitle}</span>}
              </div>
              {props.storylines.length > 0 && (
                <div
                  role="group"
                  aria-label={`Storylines of ${title}`}
                  className="flex flex-wrap gap-1"
                >
                  {props.storylines.map((t) => {
                    const on = s.storylineKeys.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        aria-pressed={on}
                        disabled={tag.isPending}
                        onClick={() =>
                          tag.mutate({
                            sceneKey: s.sceneKey,
                            storylineKeys: on
                              ? s.storylineKeys.filter((k) => k !== t.key)
                              : [...s.storylineKeys, t.key],
                          })
                        }
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${focusRing} ${on ? 'bg-selected text-on-selected' : 'bg-panel text-muted hover:text-ink'}`}
                      >
                        <span className={`size-2 rounded-full ${TYPE_BG[t.color]}`} />
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {s.documentFormat === 'markdown' && (
                <label className="flex items-center gap-2 text-sm text-muted">
                  Point of view
                  <select
                    value={s.povEntityKey ?? ''}
                    disabled={tag.isPending}
                    onChange={(e) =>
                      tag.mutate({ sceneKey: s.sceneKey, povEntityKey: e.target.value || null })
                    }
                    className={`h-8 rounded-md bg-panel px-2 text-ink ${focusRing}`}
                  >
                    <option value="">Nobody chosen</option>
                    {mentioned.length > 0 && (
                      <optgroup label="In this scene">
                        {mentioned.map((e) => (
                          <option key={e.key} value={e.key}>
                            {e.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Everyone else">
                      {others.map((e) => (
                        <option key={e.key} value={e.key}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
