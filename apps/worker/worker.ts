import { setTimeout as sleep } from 'node:timers/promises';
import type { Db } from 'mongodb';
import { jobs, type JobDoc } from '@epic/db';
import { logger } from '@epic/schemas/logger';
import type { Handlers } from './handlers';

export const MAX_ATTEMPTS = 3;
export const LOCK_MS = 5 * 60_000;
const PERMANENT = new Set(['AiOutputError', 'Invalid', 'NotFound', 'Forbidden']);
const BACKOFF_BASE_MS = 30_000;
const HEARTBEAT_EVERY_MS = 15_000;

export interface WorkerOptions {
  db: Db;
  workerId: string;
  handlers: Handlers;
  keySecret?: string;
  pollMs?: number;
}

/** Delay before retry after the given attempt: 30s, 60s, 120s, ... */
export function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** (attempt - 1);
}

/** Claims and runs at most one job. Returns the finished job's id, or null if the queue was empty. */
export async function tick(opts: WorkerOptions): Promise<JobDoc | null> {
  const { db, workerId, handlers } = opts;
  const now = new Date();
  await jobs.failAbandoned(db, { now, maxAttempts: MAX_ATTEMPTS });
  const job = await jobs.claimNext(db, {
    workerId,
    now,
    lockMs: LOCK_MS,
    maxAttempts: MAX_ATTEMPTS,
  });
  if (!job) return null;

  const handler = handlers[job.type];
  if (!handler) {
    // Retrying can't help when no handler exists for the type.
    await jobs.fail(db, job._id, workerId, `No handler for job type "${job.type}"`, null);
    logger.error('job failed', {
      jobId: job._id.toHexString(),
      type: job.type,
      reason: 'no handler',
    });
    return job;
  }

  try {
    const output = await handler(job, { db, keySecret: opts.keySecret ?? '' });
    const cost = typeof output.costMicros === 'number' ? output.costMicros : 0;
    await jobs.complete(db, job._id, workerId, output, cost);
    logger.info('job done', { jobId: job._id.toHexString(), type: job.type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Retrying can't fix invalid AI output (already retried once), bad input or a spent cap.
    const permanent = err instanceof Error && PERMANENT.has(err.name);
    const retryAt =
      !permanent && job.attempts < MAX_ATTEMPTS
        ? new Date(Date.now() + backoffMs(job.attempts))
        : null;
    await jobs.fail(db, job._id, workerId, message, retryAt);
    logger.error('job failed', {
      jobId: job._id.toHexString(),
      type: job.type,
      attempt: job.attempts,
      willRetry: retryAt !== null,
      error: message,
    });
  }
  return job;
}

/**
 * Runs jobs until `signal` aborts. Abort never interrupts a running job: the loop finishes it,
 * then returns.
 */
export async function runLoop(opts: WorkerOptions, signal: AbortSignal): Promise<void> {
  const pollMs = opts.pollMs ?? 1_000;
  let lastBeat = 0;
  while (!signal.aborted) {
    if (Date.now() - lastBeat >= HEARTBEAT_EVERY_MS) {
      await jobs.heartbeat(opts.db, opts.workerId);
      lastBeat = Date.now();
    }
    const job = await tick(opts);
    if (!job) await sleep(pollMs, undefined, { signal }).catch(() => undefined);
  }
}
