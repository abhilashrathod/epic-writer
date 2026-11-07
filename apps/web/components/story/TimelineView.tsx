'use client';

import Link from 'next/link';
import { formatStoryTime, type StoryTimeShape } from '@epic/core/calendar';
import { TYPE_BG, focusRing } from '@epic/ui';
import { useTree } from '../../lib/use-tree';
import { useTypes } from '../../lib/use-types';
import { useScenes, useStorylines } from '../../lib/use-story';
import { useUrlState } from '../../lib/use-url-state';
import { useWorld } from '../../lib/use-world';
import { useWorkspace } from '../Workspace';
import { WorkPicker } from './WorkPicker';

interface TimeItem {
  key: string;
  time: StoryTimeShape;
  rank: number; // ties at the same moment: events, then changes, then episodes and their scenes
  order: string;
  kind: string;
  label: string;
  href: string;
}

const isStoryTime = (v: unknown): v is StoryTimeShape =>
  !!v && typeof v === 'object' && typeof (v as StoryTimeShape).start === 'number';

/**
 * The timeline (GR-4) of one work, in narrative order (scenes as the audience meets them) or in
 * story time (events, changes, episodes and scenes as they happen). Scrapped things are left out.
 */
export function TimelineView() {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId);
  const scenes = useScenes(projectId);
  const storylines = useStorylines(projectId);
  const world = useWorld(projectId);
  const meta = useTypes(projectId);
  const { params, go } = useUrlState();

  const queries = [tree, scenes, storylines, world, meta];
  const error = queries.find((q) => q.error)?.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load the timeline: {error.message}
      </p>
    );
  if (queries.some((q) => q.isPending))
    return <p className="p-8 text-muted">Opening the timeline…</p>;

  const works = tree.data!.works;
  if (!works.length)
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-muted">The timeline follows a work. Create a work first.</p>
      </div>
    );
  const work = works.find((w) => w.key === params.get('work')) ?? works[0]!;
  const byTime = params.get('view') === 'time';
  const base = `/projects/${projectId}`;
  const entries = world.data!.entities.filter((e) => e.canonState !== 'scrapped');
  const entryOf = new Map(entries.map((e) => [e.key, e]));
  const threadOf = new Map(storylines.data!.map((t) => [t.key, t]));
  const workScenes = scenes.data!.filter((s) => s.workKey === work.key);
  const episodes = tree.data!.documents.filter((d) => d.workKey === work.key && d.kind === 'text');
  const leaf = work.levels.at(-1) ?? { singular: 'Episode', plural: 'Episodes' };
  const calendar = meta.data!.calendar;
  const when = (t: StoryTimeShape) => (calendar ? formatStoryTime(calendar, t) : `Day ${t.start}`);
  const sceneHref = (documentKey: string, sceneKey: string) =>
    `${base}/d/${documentKey}?scene=${sceneKey}`;

  const tab = (time: boolean, label: string) => (
    <button
      role="tab"
      aria-selected={byTime === time}
      onClick={() => go({ view: time ? 'time' : null })}
      className={`rounded-md px-3 py-1.5 text-sm ${focusRing} ${byTime === time ? 'bg-selected text-on-selected' : 'text-muted hover:bg-sunk hover:text-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Timeline</h1>
        <WorkPicker works={works} current={work.key} onPick={(k) => go({ work: k })} />
        <div
          role="tablist"
          aria-label="Order"
          className="ml-auto flex gap-1 rounded-lg bg-panel p-1"
        >
          {tab(false, 'Narrative order')}
          {tab(true, 'Story time')}
        </div>
      </header>
      <section role="tabpanel" aria-label={byTime ? 'Story time' : 'Narrative order'}>
        {byTime ? storyTime() : narrative()}
      </section>
    </div>
  );

  function narrative() {
    if (!workScenes.length)
      return (
        <p className="text-muted">No scenes in {work.name} yet. Write a scene to see it here.</p>
      );
    return (
      <ol className="flex flex-col gap-6">
        {episodes.map((ep) => {
          const inEp = workScenes.filter((s) => s.documentKey === ep.key);
          if (!inEp.length) return null;
          return (
            <li key={ep.key} className="flex flex-col gap-2">
              <h2 className="text-sm font-medium text-muted">{ep.title}</h2>
              <ol className="flex flex-col gap-2">
                {inEp.map((s) => {
                  const mentioned = s.entityKeys.flatMap((k) => entryOf.get(k) ?? []);
                  return (
                    <li
                      key={s.sceneKey}
                      className="flex flex-col gap-1.5 rounded-lg bg-surface p-3"
                    >
                      <Link
                        href={sceneHref(s.documentKey, s.sceneKey)}
                        className={`font-medium hover:underline ${focusRing}`}
                      >
                        {s.heading || 'Untitled scene'}
                      </Link>
                      {(s.storylineKeys.length > 0 || mentioned.length > 0) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                          {s.storylineKeys.flatMap((k) => {
                            const t = threadOf.get(k);
                            return t ? (
                              <span key={k} className="flex items-center gap-1.5">
                                <span className={`size-2 rounded-full ${TYPE_BG[t.color]}`} />
                                {t.name}
                              </span>
                            ) : (
                              []
                            );
                          })}
                          {mentioned.map((e) => (
                            <Link
                              key={e.key}
                              href={`${base}/codex?e=${e.key}`}
                              className={`hover:text-ink hover:underline ${focusRing}`}
                            >
                              {e.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          );
        })}
      </ol>
    );
  }

  function storyTime() {
    const types = new Map(meta.data!.types.map((t) => [t.key, t]));
    const items: TimeItem[] = [];
    for (const e of entries) {
      const type = types.get(e.typeKey);
      if (!type?.traits.includes('event')) continue;
      const date = type.fields.find((f) => f.kind === 'date' && isStoryTime(e.fields[f.key]));
      const time = date && e.fields[date.key];
      if (isStoryTime(time))
        items.push({
          key: e.key,
          time,
          rank: 0,
          order: '',
          kind: type.name,
          label: e.name,
          href: `${base}/codex?e=${e.key}`,
        });
    }
    const show = (v: unknown): string =>
      typeof v === 'string'
        ? (entryOf.get(v)?.name ?? v)
        : Array.isArray(v)
          ? v.map(show).join(', ')
          : typeof v === 'object' && v !== null
            ? JSON.stringify(v)
            : String(v);
    for (const f of world.data!.facts) {
      const e = entryOf.get(f.entityKey);
      if (!e || f.canonState === 'scrapped') continue;
      const label = types.get(e.typeKey)?.fields.find((d) => d.key === f.field)?.label ?? f.field;
      items.push({
        key: f.key,
        time: f.storyTime,
        rank: 1,
        order: '',
        kind: 'Change',
        label: `${e.name}: ${label} becomes ${show(f.value)}`,
        href: `${base}/codex?e=${e.key}`,
      });
    }
    for (const ep of episodes)
      if (ep.storyTime)
        items.push({
          key: ep.key,
          time: ep.storyTime,
          rank: 2,
          order: ep.orderPath,
          kind: leaf.singular,
          label: ep.title,
          href: `${base}/d/${ep.key}`,
        });
    for (const s of workScenes) {
      const time = s.storyTime ?? s.documentStoryTime;
      if (time)
        items.push({
          key: s.sceneKey,
          time,
          rank: 2,
          order: s.order,
          kind: 'Scene',
          label: s.heading || 'Untitled scene',
          href: sceneHref(s.documentKey, s.sceneKey),
        });
    }
    const placed = items
      .filter((i) => i.time.precision !== 'unknown')
      .sort(
        (a, b) => a.time.start - b.time.start || a.rank - b.rank || a.order.localeCompare(b.order),
      );
    const undated = episodes.filter((e) => !e.storyTime).length;
    const unit = (n: number) => (n === 1 ? leaf.singular : leaf.plural).toLowerCase();

    return (
      <div className="flex flex-col gap-3">
        {placed.length === 0 ? (
          <p className="text-muted">
            Nothing is placed in story time yet. Date an event, record a change on an entry, or set
            when an episode happens.
          </p>
        ) : (
          <ol className="flex flex-col gap-1 rounded-xl bg-surface p-3">
            {placed.map((item, i) => {
              const date = when(item.time);
              const same = i > 0 && when(placed[i - 1]!.time) === date;
              return (
                <li
                  key={`${item.kind}-${item.key}`}
                  className="grid grid-cols-[10rem_5rem_1fr] items-baseline gap-3 py-1 text-sm"
                >
                  <span className="text-muted tabular-nums">{same ? '' : date}</span>
                  <span className="text-xs text-faint">{item.kind}</span>
                  <Link
                    href={item.href}
                    className={`hover:underline ${item.kind === 'Scene' ? 'pl-4' : 'font-medium'} ${focusRing}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
        {undated > 0 && (
          <p className="text-sm text-muted">
            {undated} {unit(undated)} {undated === 1 ? 'has' : 'have'} no story time yet. Set it on
            the {unit(1)} to place it and its scenes.
          </p>
        )}
      </div>
    );
  }
}
