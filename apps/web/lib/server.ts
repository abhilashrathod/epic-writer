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
