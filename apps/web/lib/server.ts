import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diskStorage, Invalid, r2Storage, type Storage } from '@epic/core';
import { getDb } from '@epic/db';
import { loadEnv, webEnvSchema, type WebEnv } from '@epic/schemas/env';

let env: WebEnv | undefined;

/** Validated env, loaded on first use so `next build` doesn't need runtime secrets. */
export function getEnv(): WebEnv {
  if (!env) {
    env = loadEnv(webEnvSchema);
    if (process.env.E2E_AUTH_BYPASS && process.env.NODE_ENV === 'production') {
      throw new Error('E2E_AUTH_BYPASS must never be set in production');
    }
  }
  return env;
}

export function getAppDb() {
  const e = getEnv();
  return getDb(e.MONGODB_URI, e.MONGODB_DB);
}

/** Playwright runs `next dev` with E2E_AUTH_BYPASS=1 to skip GitHub. Never active in production. */
export function isE2eBypass(): boolean {
  return process.env.E2E_AUTH_BYPASS === '1' && process.env.NODE_ENV !== 'production';
}

const E2E_STORAGE_DIR = join(tmpdir(), 'epic-writer-e2e-storage');
let storage: Storage | undefined;

/**
 * Upload storage: R2 when configured, otherwise (e2e only) a throwaway folder served by
 * /api/e2e-storage, so tests never touch the real bucket.
 */
export function getStorage(): Storage {
  if (storage) return storage;
  if (isE2eBypass()) return (storage = e2eStorage());
  const e = getEnv();
  if (!e.R2_ACCOUNT_ID || !e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !e.R2_BUCKET)
    throw new Invalid('Image uploads aren’t set up. Add the R2_ settings to .env and restart.');
  return (storage = r2Storage({
    accountId: e.R2_ACCOUNT_ID,
    accessKeyId: e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    bucket: e.R2_BUCKET,
  }));
}

export function e2eStorage() {
  return diskStorage(E2E_STORAGE_DIR, '/api/e2e-storage');
}
