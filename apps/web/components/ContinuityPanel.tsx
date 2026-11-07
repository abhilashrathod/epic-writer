'use client';

import Link from 'next/link';
import type { EntityDto } from '@epic/schemas/api';
import type { ContinuityIssueDto } from '@epic/schemas/continuity';
import { Button, focusRing } from '@epic/ui';
import type { Continuity } from '../lib/use-continuity';
import { RunCost } from './RunCost';

const SEVERITY: Record<ContinuityIssueDto['severity'], { label: string; tone: string }> = {
  error: { label: 'Error', tone: 'text-bad' },
  warning: { label: 'Warning', tone: 'text-warn' },
  info: { label: 'Note', tone: 'text-muted' },
};

const RULE: Record<string, string> = {
  'dead-character-acts': 'Dead character acts',
  'item-not-held': 'Item not held',
  'timeline-clash': 'Timeline clash',
  'knowledge-leak': 'Revealed too early',
  'contradicts-canon': 'Contradicts the codex',
  'unpaid-setup': 'Unpaid setup',
  'rule-violation': 'Breaks a world rule',
  'rank-mismatch': 'Rank mismatch',
};

/** Continuity issues for the open document (AI-7): what's wrong, where, and how to fix it. */
export function ContinuityPanel(props: {
  projectId: string;
  continuity: Continuity;
  entries: EntityDto[];
  onJump: (pos: number) => void;
  onClose: () => void;
}) {
  const c = props.continuity;
  const names = new Map(props.entries.map((e) => [e.key, e.name]));
  return (
    <aside
      aria-label="Continuity"
      className="flex w-full shrink-0 flex-col gap-4 rounded-xl bg-panel p-4 md:w-96"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Continuity</h2>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      <p className="text-sm text-muted">
        Checks this episode against the codex as of its point in the story: plain rules first, then
        an AI pass. Your text is saved first.
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={() => void c.check()} disabled={c.running} className="self-start">
          {c.running ? 'Checking…' : 'Check continuity'}
        </Button>
        {c.saveError && (
          <p role="alert" className="text-sm text-bad">
            Couldn’t save your text, so the check didn’t run. Reconnect and try again.
          </p>
        )}
        {c.startError && (
          <p role="alert" className="text-sm text-bad">
            {c.startError.message}
          </p>
        )}
        <RunCost job={c.job} />
      </div>
      {c.loadError && (
        <p role="alert" className="text-sm text-bad">
          Couldn’t load issues: {c.loadError.message}
        </p>
      )}
      {c.issues.length === 0 && !c.loadError && (
        <p className="text-sm text-muted">No open issues.</p>
      )}
      <ul className="flex flex-col gap-2">
        {c.issues.map((i) => {
          const stale = i.status === 'stale';
          const sev = SEVERITY[i.severity];
          return (
            <li
              key={i.id}
              className={`flex flex-col gap-2 rounded-lg bg-surface p-3 text-sm ${stale ? 'opacity-60' : ''}`}
            >
              <p className="flex flex-wrap gap-x-2 text-xs font-medium">
                <span className={stale ? 'text-faint' : sev.tone}>{sev.label}</span>
                <span className="text-muted">{RULE[i.rule] ?? i.rule}</span>
                {stale && <span className="text-faint">Edited since the check</span>}
              </p>
              <p>{i.message}</p>
              {i.relatedKeys.length > 0 && (
                <p className="flex flex-wrap gap-x-3 text-xs">
                  {i.relatedKeys.map((k) => (
                    <Link
                      key={k}
                      href={`/projects/${props.projectId}/codex?e=${k}`}
                      className={`rounded underline-offset-2 hover:underline ${focusRing}`}
                    >
                      {names.get(k) ?? 'Entry'}
                    </Link>
                  ))}
                </p>
              )}
              <div className="flex gap-1">
                {i.range && <Button onClick={() => props.onJump(i.range!.from)}>Jump to</Button>}
                <Button onClick={() => c.dismiss(i.id)}>Dismiss</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
