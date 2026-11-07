'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProposalSummaryDto } from '@epic/schemas/proposals';
import { Button, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { useAiJob } from '../lib/use-ai-job';
import { RunCost } from './RunCost';
import { useWorkspace } from './Workspace';

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const proposalsKey = (projectId: string, documentKey: string) =>
  ['proposals', projectId, documentKey] as const;

/**
 * Extraction on request (AI-3): reads the whole document or one scene and proposes codex changes
 * for review. Nothing reaches the codex until the writer commits them on the review screen.
 */
export function ExtractPanel(props: {
  documentKey: string;
  /** Saves pending edits so the worker reads what is on screen. */
  save: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { projectId, scenes } = useWorkspace();
  const qc = useQueryClient();
  const { run, job, running, startError } = useAiJob(projectId, 'extract');
  const [target, setTarget] = useState<string | null>(null);
  const list = useQuery({
    queryKey: proposalsKey(projectId, props.documentKey),
    queryFn: () =>
      api<{ proposals: ProposalSummaryDto[] }>(
        `/api/projects/${projectId}/proposals?document=${props.documentKey}`,
      ).then((r) => r.proposals),
  });
  const done = job?.status === 'done';
  useEffect(() => {
    if (done) void qc.invalidateQueries({ queryKey: proposalsKey(projectId, props.documentKey) });
  }, [done, qc, projectId, props.documentKey]);

  async function extract(sceneKey: string | null, label: string) {
    setTarget(label);
    await props.save();
    run({ documentKey: props.documentKey, ...(sceneKey && { sceneKey }) });
  }

  const proposalId =
    done && typeof job.output.proposalId === 'string' ? job.output.proposalId : null;
  const found = typeof job?.output.changes === 'number' ? job.output.changes : 0;
  const keyed = scenes.filter((s) => s.key);

  return (
    <aside
      aria-label="Extract"
      className="flex w-full flex-col gap-4 rounded-xl bg-panel p-4 md:w-80"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Extract to codex</h2>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      <p className="text-sm text-muted">
        The AI reads the text and proposes new entries, aliases, changes and connections. Nothing
        changes in the codex until you review and commit them.
      </p>
      <Button
        variant="primary"
        className="self-start"
        disabled={running}
        onClick={() => void extract(null, 'the whole document')}
      >
        Extract whole document
      </Button>
      {keyed.length > 1 && (
        <ul aria-label="Extract one scene" className="flex flex-col gap-0.5">
          {keyed.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-muted">{s.heading || 'Untitled scene'}</span>
              <Button
                disabled={running}
                aria-label={`Extract scene ${s.heading || 'Untitled scene'}`}
                onClick={() => void extract(s.key, s.heading || 'the scene')}
              >
                Extract
              </Button>
            </li>
          ))}
        </ul>
      )}

      {startError && (
        <p role="alert" className="text-sm text-bad">
          {startError.message}
        </p>
      )}
      {job && (
        <div aria-live="polite" className="flex flex-col gap-1 rounded-lg bg-surface p-3">
          {target && <p className="text-sm font-medium">Extracting {target}</p>}
          <RunCost job={job} />
          {proposalId &&
            (found ? (
              <Link
                href={`/projects/${projectId}/review/${proposalId}`}
                className={`self-start text-sm font-medium underline ${focusRing}`}
              >
                Review {found} proposed {found === 1 ? 'change' : 'changes'}
              </Link>
            ) : (
              <p className="text-sm text-muted">Nothing new to add to the codex.</p>
            ))}
        </div>
      )}

      {!!list.data?.length && (
        <section aria-label="Earlier runs" className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Earlier runs</h3>
          <ol className="flex flex-col gap-1">
            {list.data.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${projectId}/review/${p.id}`}
                  className={`flex flex-col rounded-lg bg-surface p-2 text-sm hover:bg-sunk ${focusRing}`}
                >
                  <span className="font-medium">
                    {p.scope === 'scene' ? 'One scene' : 'Whole document'} ·{' '}
                    {p.counts.pending + p.counts.accepted} to review
                  </span>
                  <span className="text-xs text-muted">
                    {when.format(new Date(p.createdAt))} · {p.counts.applied} committed
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
