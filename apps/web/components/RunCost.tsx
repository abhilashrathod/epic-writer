'use client';

import { formatCost } from '@epic/ai/pricing';
import type { JobDto } from '@epic/schemas/api';

/** The line every AI run ends with (AI-10): what it cost, or why it failed. */
export function RunCost({ job }: { job: JobDto | null }) {
  if (!job) return null;
  if (job.status === 'failed')
    return (
      <p role="alert" className="text-sm text-bad">
        The run failed: {job.error ?? 'unknown error'}
      </p>
    );
  if (job.status !== 'done')
    return (
      <p className="text-sm text-muted">
        {job.status === 'queued' ? 'Waiting for the worker…' : 'Running…'}
      </p>
    );
  const unknown = job.output.costKnown === false;
  return (
    <p className="text-sm text-muted">
      This run cost {unknown ? formatCost(null) : formatCost(job.costMicros)}.
    </p>
  );
}
