'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatPoint } from '@epic/core/asof';
import type { AskResultDto } from '@epic/schemas/ai-ask';
import type { EntityDto, EntityTypeDto, JobDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { useAiJob } from '../lib/use-ai-job';
import { useTree } from '../lib/use-tree';
import { useEntities, useTypes } from '../lib/use-types';
import { EntryCard } from './codex/EntryCard';
import { RunCost } from './RunCost';
import { useWorkspace } from './Workspace';

interface Asked {
  question: string;
  when: string;
}

/**
 * Ask the codex (AI-8): a question answered from the codex as of the current point, citing the
 * cards it used. Runs only when asked; this session's questions stay on the page until it closes.
 */
export function AskCodex() {
  const { projectId, asOf } = useWorkspace();
  const calendar = useTypes(projectId).data?.calendar ?? null;
  const tree = useTree(projectId);
  const { run, job, running, startError, reset } = useAiJob(projectId, 'ask');
  const [question, setQuestion] = useState('');
  const [current, setCurrent] = useState<Asked | null>(null);
  const [past, setPast] = useState<(Asked & { job: JobDto })[]>([]);

  const episode = tree.data?.documents.find(
    (d) => d.workKey === asOf.workKey && d.orderPath === asOf.order?.replace(/\.9999$/, ''),
  );
  const when = [
    asOf.storyTime === null
      ? 'the end of the story'
      : calendar
        ? formatPoint(calendar, asOf.storyTime)
        : `day ${asOf.storyTime}`,
    episode?.title,
  ]
    .filter(Boolean)
    .join(', after ');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || running) return;
    if (current && job) setPast((p) => [{ ...current, job }, ...p]);
    reset();
    setCurrent({ question: q, when });
    setQuestion('');
    run({ question: q, asOf });
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ask the codex</h1>
        <p className="text-muted">
          Answering as of <span className="font-medium text-ink">{when}</span>. Answers use only
          what the codex knows at that point. Change the point with “As of” in the sidebar.
        </p>
      </header>

      <form
        aria-label="Ask the codex"
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-xl bg-panel p-4"
      >
        <label htmlFor="ask-question" className="text-sm font-medium">
          Your question
        </label>
        <textarea
          id="ask-question"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder="Who holds the bow right now?"
          maxLength={2000}
          className={`resize-y rounded-lg bg-sunk px-3 py-2 placeholder:text-faint ${focusRing}`}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={running || !question.trim()}>
            {running ? 'Asking…' : 'Ask'}
          </Button>
          <span className="text-xs text-faint">
            Each question is one AI run, billed to your key.
          </span>
        </div>
        {startError && (
          <p role="alert" className="text-sm text-bad">
            Couldn’t ask: {startError.message}
          </p>
        )}
      </form>

      {current && <AskAnswer projectId={projectId} asked={current} job={job} live />}
      {past.length > 0 && (
        <section aria-label="Earlier questions" className="flex flex-col gap-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-faint">
            Earlier this session
          </h2>
          {past.map((p) => (
            <AskAnswer key={p.job.id} projectId={projectId} asked={p} job={p.job} />
          ))}
        </section>
      )}
    </div>
  );
}

function AskAnswer({
  projectId,
  asked,
  job,
  live = false,
}: {
  projectId: string;
  asked: Asked;
  job: JobDto | null;
  live?: boolean;
}) {
  const entities = useEntities(projectId).data ?? [];
  const types = useTypes(projectId).data?.types ?? [];
  const out = job?.status === 'done' ? (job.output as unknown as AskResultDto) : null;
  const cited = (out?.citedKeys ?? [])
    .map((k) => entities.find((e) => e.key === k))
    .filter((e): e is EntityDto => !!e);
  return (
    <article
      aria-label={asked.question}
      aria-live={live ? 'polite' : undefined}
      className="flex flex-col gap-3 rounded-xl bg-panel p-4"
    >
      <div>
        <p className="font-medium">{asked.question}</p>
        <p className="text-xs text-faint">As of {asked.when}</p>
      </div>
      {out && <p className="whitespace-pre-wrap leading-relaxed">{out.answer}</p>}
      {cited.length > 0 && (
        <section aria-label="Cards used" className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Cards used</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
            {cited.map((e) => (
              <li key={e.key}>
                <Link
                  href={`/projects/${projectId}/codex?e=${e.key}`}
                  className={`block h-full rounded-xl ${focusRing}`}
                >
                  <EntryCard entry={e} type={typeOf(types, e)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RunCost job={job} />
    </article>
  );
}

const typeOf = (types: EntityTypeDto[], e: EntityDto) => types.find((t) => t.key === e.typeKey);
