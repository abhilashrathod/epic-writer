'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type RefObject } from 'react';
import type { ContinuityIssueDto } from '@epic/schemas/continuity';
import type { EditorHandle } from '../components/ScriptEditor';
import { api } from './api-client';
import { useAiJob } from './use-ai-job';

/**
 * Continuity for one document (AI-6, AI-7): runs a check on request, lists the issues and keeps
 * the editor's underlines in step. Nothing here runs per keystroke; issues refresh after a check
 * and after saves while open issues exist (the server marks edited ones stale).
 */
export function useContinuity(p: {
  projectId: string;
  documentKey: string;
  editor: RefObject<EditorHandle | null>;
  /** Saves pending edits; resolves true when the server has the text on screen. */
  save: () => Promise<boolean>;
  saved: boolean;
}) {
  const { projectId, documentKey, editor } = p;
  const qc = useQueryClient();
  const base = `/api/projects/${projectId}`;
  const queryKey = ['continuity', projectId, documentKey];
  const issues = useQuery({
    queryKey,
    queryFn: () =>
      api<{ issues: ContinuityIssueDto[] }>(`${base}/documents/${documentKey}/continuity`),
    select: (r) => r.issues,
    refetchOnWindowFocus: false,
  });
  const job = useAiJob(projectId, 'continuity');
  const [saveError, setSaveError] = useState(false);

  const list = issues.data;
  useEffect(() => {
    const ed = editor.current;
    if (!ed || !list) return;
    const text = ed.getText();
    // An underline goes only where the editor still shows the flagged text.
    ed.setUnderlines(
      list.flatMap((i) =>
        i.status === 'open' && i.range && text.slice(i.range.from, i.range.to) === i.quote
          ? [{ id: i.id, from: i.range.from, to: i.range.to, severity: i.severity }]
          : [],
      ),
    );
  }, [list, editor]);

  const done = job.job?.status === 'done';
  useEffect(() => {
    if (done) void qc.invalidateQueries({ queryKey });
  }, [done, qc, projectId, documentKey]);

  const hasOpen = !!list?.some((i) => i.status === 'open');
  useEffect(() => {
    if (p.saved && hasOpen) void qc.invalidateQueries({ queryKey });
  }, [p.saved, qc, projectId, documentKey]);

  const dismiss = useMutation({
    mutationFn: (id: string) => api(`${base}/continuity/${id}/dismiss`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    issues: list ?? [],
    loadError: issues.error,
    job: job.job,
    running: job.running,
    startError: job.startError,
    saveError,
    async check() {
      setSaveError(false);
      if (!(await p.save())) return setSaveError(true);
      job.run({ documentKey });
    },
    dismiss: (id: string) => dismiss.mutate(id),
  };
}

export type Continuity = ReturnType<typeof useContinuity>;
