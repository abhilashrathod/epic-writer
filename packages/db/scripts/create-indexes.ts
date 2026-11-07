import { loadEnv, mongoEnvSchema } from '@epic/schemas/env';
import { getDb, getMongoClient } from '../client';
import { ensureIndexes } from '../indexes';
import { logger } from '@epic/schemas/logger';

const env = loadEnv(mongoEnvSchema);
try {
  const result = await ensureIndexes(getDb(env.MONGODB_URI, env.MONGODB_DB));
  logger.info('collections created', { collections: result.createdCollections });
  for (const s of result.skipped) logger.info('index skipped', { index: s });
  logger.info('indexes verified');
} finally {
  await getMongoClient(env.MONGODB_URI).close();
}
