import { jobs, pingDb } from '@epic/db';
import { logger } from '@epic/schemas/logger';
import { getAppDb } from '../../../lib/server';

export const dynamic = 'force-dynamic';

/** Public liveness check. `worker` is the last worker heartbeat (see AGENTS.md, "Jobs and the worker"). */
export async function GET() {
  let mongo: 'up' | 'down' = 'down';
  let worker: Date | null = null;
  try {
    const db = getAppDb();
    await pingDb(db);
    mongo = 'up';
    worker = await jobs.lastHeartbeat(db);
  } catch (err) {
    logger.warn('health check: mongo down', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const ok = mongo === 'up';
  return Response.json(
    { ok, mongo, worker: worker?.toISOString() ?? null },
    { status: ok ? 200 : 503 },
  );
}
