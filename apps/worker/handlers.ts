import { setTimeout as sleep } from 'node:timers/promises';
import type { Db } from 'mongodb';
import type { JobDoc, JobType } from '@epic/db';

export interface HandlerContext {
  db: Db;
}

/** Runs one job and returns its output. Throwing marks the attempt failed. */
export type JobHandler = (job: JobDoc, ctx: HandlerContext) => Promise<Record<string, unknown>>;

export type Handlers = Partial<Record<JobType, JobHandler>>;

export const handlers: Handlers = {
  noop: async () => {
    await sleep(500);
    return { ok: true };
  },
};
