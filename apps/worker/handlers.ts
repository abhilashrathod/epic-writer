import { setTimeout as sleep } from 'node:timers/promises';
import type { Db } from 'mongodb';
import type { JobDoc, JobType } from '@epic/db';
import { ask } from './handlers/ask';
import { extract } from './handlers/extract';
import { continuityHandler } from './handlers/continuity';
import { exportBackup } from './handlers/export';

export interface HandlerContext {
  db: Db;
  /** KEY_ENCRYPTION_SECRET, for decrypting the project owner's AI key. */
  keySecret: string;
  /** BACKUP_DIR, where nightly backups go; unset turns them off. */
  backupDir?: string;
}

/** Runs one job and returns its output. Throwing marks the attempt failed. */
export type JobHandler = (job: JobDoc, ctx: HandlerContext) => Promise<Record<string, unknown>>;

export type Handlers = Partial<Record<JobType, JobHandler>>;

export const handlers: Handlers = {
  noop: async () => {
    await sleep(500);
    return { ok: true };
  },
  ask,
  extract,
  continuity: continuityHandler,
  export: exportBackup,
};
