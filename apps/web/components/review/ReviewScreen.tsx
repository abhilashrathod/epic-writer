'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatCost } from '@epic/ai/pricing';
import type { ProposalDto } from '@epic/schemas/proposals';
import { Button, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { entitiesKey, useEntities, useLinkTypes, useTypes } from '../../lib/use-types';
import { worldKey } from '../../lib/use-world';
import { useWorkspace } from '../Workspace';
import { ChangeCard, type ChangeEdit, type ReviewNames } from './ChangeCard';
import { SourceText } from './SourceText';

const ACCEPT_ALL_AT = 0.9;

/**
 * The review screen for one extraction run (AI-4), like a pull request: the source with each
 * change's quote highlighted, the proposed changes beside it, and one commit for what's accepted.
 */
export function ReviewScreen({ proposalId }: { proposalId: string }) {
  const { projectId } = useWorkspace();
  const qc = useQueryClient();
  const base = `/api/projects/${projectId}/proposals/${proposalId}`;
  const key = ['proposal', projectId, proposalId];
  const proposal = useQuery({ queryKey: key, queryFn: () => api<ProposalDto>(base) });
  const entities = useEntities(projectId);
  const meta = useTypes(projectId);
  const linkTypes = useLinkTypes(projectId);
  const [active, setActive] = useState<number | null>(null);

  const patch = useMutation({
    mutationFn: (changes: (ChangeEdit & { index: number })[]) =>
      api<ProposalDto>(base, { method: 'PATCH', body: { changes } }),
    onSuccess: (p) => qc.setQueryData(key, p),
  });
  const apply = useMutation({
    mutationFn: () => api<{ seq: number; applied: number }>(`${base}/apply`, { method: 'POST' }),
    onSuccess: () =>
      Promise.all(
        [key, worldKey(projectId), entitiesKey(projectId), ['proposals', projectId]].map(
          (queryKey) => qc.invalidateQueries({ queryKey }),
        ),
      ),
  });

  const p = proposal.data;
  const names = useMemo<ReviewNames>(() => {
    const entries = new Map((entities.data ?? []).map((e) => [e.key, e]));
    const created = new Map(
      (p?.changes ?? [])
        .filter((c) => c.op === 'createEntity')
        .map((c) => [String(c.payload.ref), c.payload]),
    );
    const types = meta.data?.types ?? [];
    const typeKeyOf = (ref: unknown) =>
      created.get(String(ref))?.typeKey ?? entries.get(String(ref))?.typeKey;
    const entry = (ref: unknown) => {
      const made = created.get(String(ref));
      if (made) return `${String(made.name)} (new)`;
      return entries.get(String(ref))?.name ?? 'an entry';
    };
    return {
      entry,
      type: (k) => types.find((t) => t.key === k)?.name ?? 'Entry',
      field: (ref, f) =>
        types.find((t) => t.key === typeKeyOf(ref))?.fields.find((x) => x.key === f)?.label ??
        String(f),
      link: (k) => linkTypes.data?.find((l) => l.key === k)?.label ?? 'connected to',
      value: (v) =>
        typeof v === 'string' && (entries.has(v) || created.has(v)) ? entry(v) : String(v),
    };
  }, [entities.data, meta.data, linkTypes.data, p?.changes]);
  const quotes = useMemo(
    () => (p?.changes ?? []).map((c) => ({ index: c.index, quote: String(c.payload.quote ?? '') })),
    [p?.changes],
  );

  if (proposal.isPending) return <p className="p-8 text-muted">Opening the review…</p>;
  if (proposal.error || !p)
    return (
      <p role="alert" className="m-8 rounded-lg bg-bad-soft p-3 text-bad">
        Couldn’t open this review: {proposal.error?.message}
      </p>
    );

  const accepted = p.changes.filter((c) => c.status === 'accepted').length;
  const sure = p.changes.filter(
    (c) => c.status === 'pending' && c.confidence >= ACCEPT_ALL_AT && !c.payload.needsChoice,
  );
  const busy = patch.isPending || apply.isPending;
  const error = patch.error ?? apply.error;

  return (
    <div className="flex flex-col gap-4 px-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Review extracted changes</h1>
          <p className="text-sm text-muted">
            From “{p.source.documentTitle}”{p.source.heading ? `, ${p.source.heading}` : ''} ·{' '}
            {p.changes.length} proposed · this run cost {formatCost(p.costMicros)}
          </p>
          {p.documentKey && (
            <Link
              href={`/projects/${projectId}/d/${p.documentKey}`}
              className={`self-start text-sm text-muted underline hover:text-ink ${focusRing}`}
            >
              Back to the document
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={busy || sure.length === 0}
            onClick={() => patch.mutate(sure.map((c) => ({ index: c.index, status: 'accepted' })))}
          >
            Accept all ≥ 90%
          </Button>
          <Button
            variant="primary"
            disabled={busy || accepted === 0}
            onClick={() => apply.mutate()}
          >
            Commit accepted changes{accepted ? ` (${accepted})` : ''}
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
          {error.message}
        </p>
      )}
      {apply.data && !apply.isPending && (
        <p role="status" className="rounded-lg bg-ok-soft p-3 text-sm">
          Committed {apply.data.applied} {apply.data.applied === 1 ? 'change' : 'changes'} to the
          codex as one commit.{' '}
          <Link href={`/projects/${projectId}/codex`} className={`underline ${focusRing}`}>
            Open the codex
          </Link>
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section
          aria-label="Source text"
          className="max-h-[75vh] overflow-y-auto rounded-xl bg-surface p-6 lg:sticky lg:top-4"
        >
          <SourceText text={p.source.text} quotes={quotes} active={active} />
        </section>
        <section aria-label="Proposed changes" className="flex flex-col gap-2">
          {p.changes.length === 0 && (
            <p className="text-sm text-muted">This run found nothing new for the codex.</p>
          )}
          <ol className="flex flex-col gap-2">
            {p.changes.map((c) => (
              <li key={c.index}>
                <ChangeCard
                  change={c}
                  names={names}
                  busy={busy}
                  onPatch={(edit) => patch.mutate([{ index: c.index, ...edit }])}
                  onActive={(on) => setActive(on ? c.index : null)}
                />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
