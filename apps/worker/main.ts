import { getDb, getMongoClient } from '@epic/db';
import { loadEnv, workerEnvSchema } from '@epic/schemas/env';
import { logger } from '@epic/schemas/logger';
import { handlers } from './handlers';
import { runLoop } from './worker';

const env = loadEnv(workerEnvSchema);
const db = getDb(env.MONGODB_URI, env.MONGODB_DB);
const stop = new AbortController();

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    logger.info('shutting down after current job', { signal: sig });
    stop.abort();
  });
}

logger.info('worker started', { workerId: env.WORKER_ID });
try {
  await runLoop(
    { db, workerId: env.WORKER_ID, handlers, keySecret: env.KEY_ENCRYPTION_SECRET },
    stop.signal,
  );
} finally {
  await getMongoClient(env.MONGODB_URI).close();
  logger.info('worker stopped');
}
