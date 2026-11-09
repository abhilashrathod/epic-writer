'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { focusRing } from '@epic/ui';
import { useEntities, useTypes } from '../../lib/use-types';
import { useWorkspace } from '../Workspace';
import { EntryForm } from './EntryForm';

/** The full-page home of the new-entry and edit wizards. */
export function EntryEditorPage({ entryKey }: { entryKey?: string }) {
  const { projectId } = useWorkspace();
  const meta = useTypes(projectId);
  const entities = useEntities(projectId);
  const typeKey = useSearchParams().get('type') ?? undefined;
  const router = useRouter();
  const codex = `/projects/${projectId}/codex`;

  if (meta.isPending || entities.isPending) return <p className="p-8 text-muted">Opening…</p>;
  const error = meta.error ?? entities.error;
  if (error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t open the entry: {error.message}
      </p>
    );
  const existing = entryKey ? (entities.data!.find((e) => e.key === entryKey) ?? null) : null;

  let body: React.ReactNode;
  if (entryKey && !existing) body = <p className="text-muted">This entry no longer exists.</p>;
  else if (meta.data!.types.length === 0)
    body = (
      <Link href={`${codex}/templates`} className={`self-start text-sm underline ${focusRing}`}>
        Entries need a type first. Create one from a template.
      </Link>
    );
  else
    body = (
      <EntryForm
        key={existing?.key ?? `new:${typeKey ?? ''}`}
        wide
        projectId={projectId}
        meta={meta.data!}
        entries={entities.data!}
        existing={existing}
        initialTypeKey={typeKey}
        onDone={(key) => router.push(key ? `${codex}?e=${key}` : codex)}
      />
    );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-6 py-6">
      <Link href={codex} className={`self-start text-sm text-muted hover:text-ink ${focusRing}`}>
        ← Codex
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {existing ? `Edit ${existing.name}` : 'New entry'}
      </h1>
      {body}
    </div>
  );
}
