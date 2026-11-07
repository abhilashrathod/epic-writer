'use client';

import { useState } from 'react';
import { Button, TYPE_BG } from '@epic/ui';
import { useTree } from '../../lib/use-tree';
import { useEntities } from '../../lib/use-types';
import { useScenes, useStorylines } from '../../lib/use-story';
import { useUrlState } from '../../lib/use-url-state';
import { useWorkspace } from '../Workspace';
import { SceneList } from './SceneList';
import { StorylineForm } from './StorylineForm';
import { ThreadGrid } from './ThreadGrid';
import { WorkPicker } from './WorkPicker';

/**
 * Storylines (GR-7): a threads × episodes grid per work, one thread followed alone (`?thread=`),
 * or one episode's scenes to tag (`?episode=`).
 */
export function StorylinesView() {
  const { projectId } = useWorkspace();
  const tree = useTree(projectId);
  const scenes = useScenes(projectId);
  const storylines = useStorylines(projectId);
  const entries = useEntities(projectId);
  const { params, go } = useUrlState();
  const [form, setForm] = useState<'new' | 'edit' | null>(null);

  const pending = [tree, scenes, storylines, entries].find((q) => q.isPending);
  const error = [tree, scenes, storylines, entries].find((q) => q.error)?.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load storylines: {error.message}
      </p>
    );
  if (pending) return <p className="p-8 text-muted">Opening storylines…</p>;

  const works = tree.data!.works;
  if (!works.length)
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Storylines</h1>
        <p className="text-muted">Storylines follow threads through a work. Create a work first.</p>
      </div>
    );
  const work = works.find((w) => w.key === params.get('work')) ?? works[0]!;
  const episodes = tree.data!.documents.filter((d) => d.workKey === work.key && d.kind === 'text');
  const workScenes = scenes.data!.filter((s) => s.workKey === work.key);
  const threads = storylines.data!.filter((t) => t.workKey === null || t.workKey === work.key);
  const thread = threads.find((t) => t.key === params.get('thread')) ?? null;
  const episode = episodes.find((e) => e.key === params.get('episode')) ?? null;
  const list = (rows: typeof workScenes, showEpisode: boolean) => (
    <SceneList
      projectId={projectId}
      scenes={rows}
      storylines={threads}
      entries={entries.data!}
      showEpisode={showEpisode}
    />
  );

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Storylines</h1>
        <WorkPicker
          works={works}
          current={work.key}
          onPick={(k) => go({ work: k, thread: null, episode: null })}
        />
        {form !== 'new' && (
          <Button variant="primary" className="ml-auto" onClick={() => setForm('new')}>
            New storyline
          </Button>
        )}
      </header>

      {form === 'new' && (
        <div className="max-w-md">
          <StorylineForm
            projectId={projectId}
            workKey={work.key}
            onDone={(key) => {
              setForm(null);
              if (key) go({ thread: key, episode: null });
            }}
          />
        </div>
      )}

      {threads.length === 0 ? (
        <p className="text-muted">
          No storylines in {work.name} yet. Create one for each thread you follow, such as one
          character’s journey.
        </p>
      ) : episodes.length === 0 ? (
        <p className="text-muted">{work.name} has no episodes or chapters yet.</p>
      ) : (
        <ThreadGrid
          storylines={threads}
          episodes={episodes}
          scenes={workScenes}
          selectedThread={thread?.key ?? null}
          selectedEpisode={episode?.key ?? null}
          onThread={(k) => {
            setForm(null);
            go({ thread: k === thread?.key ? null : k, episode: null });
          }}
          onEpisode={(k) => go({ episode: k === episode?.key ? null : k, thread: null })}
        />
      )}

      {thread && (
        <section aria-label={`Thread: ${thread.name}`} className="flex max-w-3xl flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className={`size-3 rounded-full ${TYPE_BG[thread.color]}`} />
            <h2 className="text-lg font-semibold">{thread.name}</h2>
            {form !== 'edit' && <Button onClick={() => setForm('edit')}>Edit storyline</Button>}
          </div>
          {form === 'edit' && (
            <StorylineForm
              key={thread.key}
              projectId={projectId}
              workKey={work.key}
              existing={thread}
              onDone={(key) => {
                setForm(null);
                if (!key) go({ thread: null });
              }}
            />
          )}
          {list(
            workScenes.filter((s) => s.storylineKeys.includes(thread.key)),
            true,
          )}
        </section>
      )}

      {episode && (
        <section
          aria-label={`Scenes of ${episode.title}`}
          className="flex max-w-3xl flex-col gap-3"
        >
          <h2 className="text-lg font-semibold">{episode.title}</h2>
          {list(
            workScenes.filter((s) => s.documentKey === episode.key),
            false,
          )}
        </section>
      )}

      {!thread && !episode && threads.length > 0 && episodes.length > 0 && (
        <p className="text-sm text-muted">
          Pick a storyline to follow it alone, or an episode to tag its scenes.
        </p>
      )}
    </div>
  );
}
