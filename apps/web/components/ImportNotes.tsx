'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ChangeEvent } from 'react';
import { formatCost } from '@epic/ai/pricing';
import {
  IMPORT_EXTENSIONS,
  MAX_IMPORT_BYTES,
  type ImportedNoteDto,
  type ImportStatusDto,
} from '@epic/schemas/import';
import { Button, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { treeKey } from '../lib/use-tree';
import { useWorkspace } from './Workspace';

// Under ['proposals', projectId] so committing on the review screen refreshes it.
const statusKey = (projectId: string) => ['proposals', projectId, 'import'] as const;

const primaryPill = `inline-flex h-9 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary hover:opacity-90 ${focusRing}`;

const STATE_LABEL: Record<ImportedNoteDto['state'], string> = {
  new: 'Not extracted',
  extracting: 'Extracting…',
  failed: 'Extraction failed',
  review: '',
  reviewed: 'Reviewed',
};

/**
 * IO-1: imports existing notes as note documents, extracts them in one batch on request, and
 * queues their proposals for review one run at a time.
 */
export function ImportNotes() {
  const { projectId } = useWorkspace();
  const qc = useQueryClient();
  const base = `/api/projects/${projectId}/import`;
  const status = useQuery({
    queryKey: statusKey(projectId),
    queryFn: () => api<ImportStatusDto>(base),
    refetchInterval: (q) =>
      q.state.data?.notes.some((n) => n.state === 'extracting') ? 1500 : false,
  });
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const refresh = () =>
    Promise.all(
      [statusKey(projectId), treeKey(projectId)].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
  const extract = useMutation({
    mutationFn: () => api<{ queued: number }>(`${base}/extract`, { method: 'POST' }),
    onSuccess: refresh,
  });

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const failed: string[] = [];
    // One file per request keeps each upload under the server's body limit.
    for (const [i, file] of files.entries()) {
      setProgress(`Importing ${i + 1} of ${files.length}: ${file.name}`);
      if (file.size > MAX_IMPORT_BYTES) {
        failed.push(`${file.name}: files must be 10 MB or smaller. Split it before importing.`);
        continue;
      }
      const form = new FormData();
      form.append('file', file);
      await api(base, { method: 'POST', body: form }).catch((err: unknown) =>
        failed.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
    setErrors(failed);
    setProgress(null);
    await refresh();
  }

  const notes = status.data?.notes ?? [];
  const todo = notes.filter((n) => n.state === 'new' || n.state === 'failed').length;
  const extracted = notes.filter((n) => n.state === 'review' || n.state === 'reviewed').length;
  const extracting = notes.filter((n) => n.state === 'extracting').length;
  const toReview = notes.filter((n) => n.state === 'review');
  const waiting = toReview.reduce((sum, n) => sum + n.pending, 0);
  const next = toReview[0];
  const primary = !notes.length ? 'import' : todo ? 'extract' : next ? 'review' : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Import notes</h1>
        <p className="text-muted">
          Bring in existing notes to start the codex. Each file becomes a note under “Imported
          notes”. The AI then proposes entries from them, and nothing reaches the codex until you
          review and commit it.
        </p>
      </header>

      <section aria-label="Choose files" className="flex flex-col gap-3 rounded-xl bg-panel p-4">
        <label htmlFor="import-files" className="text-sm font-medium">
          Choose note files
        </label>
        <input
          id="import-files"
          type="file"
          multiple
          accept={IMPORT_EXTENSIONS.join(',')}
          disabled={progress !== null}
          onChange={(e) => void upload(e)}
          className={`text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border-0 file:px-5 file:font-medium ${
            primary === 'import'
              ? 'file:bg-primary file:text-on-primary'
              : 'file:bg-sunk file:text-ink'
          } ${focusRing}`}
        />
        <p className="text-xs text-faint">
          Markdown, text, Word (.docx) or PDF, up to 10 MB each. Long notes are split into parts.
        </p>
        {progress && (
          <p aria-live="polite" className="text-sm text-muted">
            {progress}
          </p>
        )}
        {errors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-bad">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      {status.error && (
        <p role="alert" className="text-sm text-bad">
          Couldn’t load imported notes: {status.error.message}
        </p>
      )}

      {notes.length > 0 && (
        <section aria-label="Extraction" className="flex flex-col gap-3 rounded-xl bg-panel p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={primary === 'extract' ? 'primary' : 'quiet'}
              disabled={!todo || extract.isPending}
              onClick={() => extract.mutate()}
            >
              Extract all not yet extracted{todo ? ` (${todo})` : ''}
            </Button>
            {next?.proposalId &&
              (primary === 'review' ? (
                <Link
                  href={`/projects/${projectId}/review/${next.proposalId}`}
                  className={primaryPill}
                >
                  Review next
                </Link>
              ) : (
                <Link
                  href={`/projects/${projectId}/review/${next.proposalId}`}
                  className={`text-sm font-medium text-muted hover:text-ink ${focusRing}`}
                >
                  Review next
                </Link>
              ))}
          </div>
          <div aria-live="polite" className="flex flex-col gap-0.5 text-sm text-muted">
            <p>
              {extracted} of {notes.length} notes extracted
              {extracting ? ` · ${extracting} extracting…` : ''}
            </p>
            {waiting > 0 && (
              <p>
                {waiting} {waiting === 1 ? 'change' : 'changes'} waiting for review in{' '}
                {toReview.length} {toReview.length === 1 ? 'note' : 'notes'}
              </p>
            )}
            {extracted > 0 && (
              <p>Extraction so far cost {formatCost(status.data?.costMicros ?? null)}.</p>
            )}
          </div>
          {extract.error && (
            <p role="alert" className="text-sm text-bad">
              {extract.error.message}
            </p>
          )}
        </section>
      )}

      {notes.length > 0 && (
        <section aria-labelledby="imported-heading" className="flex flex-col gap-2">
          <h2
            id="imported-heading"
            className="text-sm font-medium uppercase tracking-wide text-faint"
          >
            Imported notes
          </h2>
          <ul className="flex flex-col gap-1">
            {notes.map((n) => (
              <NoteRow key={n.documentKey} note={n} projectId={projectId} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function NoteRow({ note, projectId }: { note: ImportedNoteDto; projectId: string }) {
  const review = `/projects/${projectId}/review/${note.proposalId}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-surface px-3 py-2">
      <Link
        href={`/projects/${projectId}/d/${note.documentKey}`}
        className={`font-medium hover:underline ${focusRing}`}
      >
        {note.title}
      </Link>
      <span className="flex items-center gap-3 text-sm text-muted">
        {note.state === 'review' && note.proposalId ? (
          <Link href={review} className={`font-medium text-ink underline ${focusRing}`}>
            Review {note.pending} {note.pending === 1 ? 'change' : 'changes'}
          </Link>
        ) : note.state === 'reviewed' && note.proposalId ? (
          <Link href={review} className={`hover:text-ink ${focusRing}`}>
            Reviewed
          </Link>
        ) : (
          <span className={note.state === 'failed' ? 'text-bad' : undefined}>
            {STATE_LABEL[note.state]}
            {note.error ? `: ${note.error}` : ''}
          </span>
        )}
      </span>
    </li>
  );
}
