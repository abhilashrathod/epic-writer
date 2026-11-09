// Converts free-text story references to scene links in every project (see AGENTS.md).
// Each project gets one commit that History can undo; running it again changes nothing.
import { migrateNarrativeRefs } from '@epic/core';
import { backups, getDb, getMongoClient, projects } from '@epic/db';
import { loadEnv, webEnvSchema } from '@epic/schemas/env';
import { logger } from '@epic/schemas/logger';

const env = loadEnv(webEnvSchema.pick({ MONGODB_URI: true, MONGODB_DB: true }));
const db = getDb(env.MONGODB_URI, env.MONGODB_DB);
try {
  for (const { _id } of await backups.listProjects(db)) {
    const project = await projects.findById(db, _id);
    if (!project) continue;
    const result = await migrateNarrativeRefs(db, {
      project,
      scope: { projectId: project._id, branchId: project.mainBranchId },
      userId: project.ownerId,
    });
    logger.info('story references converted', { project: project.name, ...result });
  }
} catch (e) {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await getMongoClient(env.MONGODB_URI).close();
}
