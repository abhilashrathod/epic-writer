'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AI_JOB_TYPES, JobDto } from '@epic/schemas/api';
import { api } from './api-client';

/**
 * Queues an AI job on request and polls it until it finishes. `job` has the worker's output, its
 * cost (`costMicros`) and any error. Never call `run` automatically: AI runs only when asked.
 */
export function useAiJob(projectId: string, type: (typeof AI_JOB_TYPES)[number]) {
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<{ id: string }>(`/api/projects/${projectId}/jobs`, {
        method: 'POST',
        body: { type, input },
      }),
    onSuccess: (r) => setJobId(r.id),
  });
  const job = useQuery({
    queryKey: ['job', projectId, jobId],
    queryFn: () => api<JobDto>(`/api/projects/${projectId}/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (q) =>
      q.state.data && ['done', 'failed', 'cancelled'].includes(q.state.data.status) ? false : 1000,
  });
  const running =
    start.isPending ||
    (jobId !== null && !['done', 'failed', 'cancelled'].includes(job.data?.status ?? 'queued'));
  return {
    run: (input: Record<string, unknown>) => start.mutate(input),
    job: job.data ?? null,
    running,
    /** Couldn't queue (no key, cap reached) or couldn't reach the server. */
    startError: start.error,
    reset: () => setJobId(null),
  };
}
