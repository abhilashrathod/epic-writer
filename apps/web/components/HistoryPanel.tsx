'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { VersionDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';

const REASON: Record<VersionDto['reason'], string> = {
  'autosave-checkpoint': 'Autosave',
  manual: 'Snapshot',
  'before-ai': 'Before AI change',
  commit: 'Commit',
  import: 'Import',
};

const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Version history for one document (ED-10): named snapshots, checkpoints, preview and restore. */
export function HistoryPanel(props: {
  base: string;
  /** Saves pending edits first; resolves to the version restore must start from, or null if it can't. */
  prepareRestore: () => Promise<number | null>;
  onRestored: (r: { text: string; version: number }) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listKey = ['versions', props.base];
  const versions = useQuery({
    queryKey: listKey,
    queryFn: () => api<{ versions: VersionDto[] }>(`${props.base}/versions`),
  });
  const [label, setLabel] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['version', props.base, previewId],
    queryFn: () => api<VersionDto & { text: string }>(`${props.base}/versions/${previewId}`),
    enabled: previewId !== null,
  });
  const snapshot = useMutation({
    mutationFn: async () => {
      // Snapshot what is on screen, not only what was last saved.
      await props.prepareRestore();
      return api(`${props.base}/versions`, { method: 'POST', body: { label } });
    },
    onSuccess: () => {
      setLabel('');
      return qc.invalidateQueries({ queryKey: listKey });
    },
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const baseVersion = await props.prepareRestore();
      if (baseVersion === null)
        throw new Error('Save your changes before restoring: the server can’t be reached.');
      return api<{ text: string; version: number }>(`${props.base}/versions/${id}/restore`, {
        method: 'POST',
        body: { baseVersion },
      });
    },
    onSuccess: (r) => {
      setConfirmId(null);
      props.onRestored(r);
      return qc.invalidateQueries({ queryKey: listKey });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    snapshot.mutate();
  }

  return (
    <aside
      aria-label="History"
      className="flex w-full flex-col gap-4 rounded-xl bg-panel p-4 md:w-80"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">History</h2>
        <Button onClick={props.onClose}>Close</Button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Field
          label="Snapshot name"
          placeholder="e.g. Before the rewrite"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={200}
          error={snapshot.error?.message}
        />
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={snapshot.isPending}
        >
          Save snapshot
        </Button>
      </form>

      {versions.isPending && <p className="text-sm text-muted">Loading history…</p>}
      {versions.error && (
        <p role="alert" className="text-sm text-bad">
          Couldn’t load history: {versions.error.message}
        </p>
      )}
      {versions.data?.versions.length === 0 && (
        <p className="text-sm text-muted">
          No versions yet. One is kept automatically when you first save.
        </p>
      )}

      <ol className="flex flex-col gap-1">
        {versions.data?.versions.map((v) => (
          <li key={v.id} className="flex flex-col gap-1 rounded-lg bg-surface p-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{v.label || REASON[v.reason]}</span>
              <span className="text-xs text-muted">{v.wordCount} words</span>
            </div>
            <span className="text-xs text-muted">{when.format(new Date(v.createdAt))}</span>
            <div className="flex gap-1">
              <Button
                className="h-7"
                onClick={() => setPreviewId(previewId === v.id ? null : v.id)}
                aria-expanded={previewId === v.id}
              >
                {previewId === v.id ? 'Hide' : 'Preview'}
              </Button>
              <Button className="h-7" onClick={() => setConfirmId(v.id)}>
                Restore
              </Button>
            </div>
            {previewId === v.id && (
              <pre
                className={`max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-sunk p-2 font-script text-xs ${focusRing}`}
                tabIndex={0}
              >
                {preview.data?.id === v.id ? preview.data.text || '(empty)' : 'Loading…'}
              </pre>
            )}
            {confirmId === v.id && (
              <div role="alert" className="flex flex-col gap-2 rounded-md bg-warn-soft p-2">
                <span>
                  Replace the current text with this version? The current text is kept in history
                  first.
                </span>
                <div className="flex gap-1">
                  <button
                    className={`rounded-md bg-ink px-2 py-1 font-medium text-surface ${focusRing}`}
                    onClick={() => restore.mutate(v.id)}
                    disabled={restore.isPending}
                  >
                    Restore this version
                  </button>
                  <Button className="h-7" onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
                {restore.error && <span className="text-bad">{restore.error.message}</span>}
              </div>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
