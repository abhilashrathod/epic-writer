// Restores a project from a backup file (IO-7): pnpm restore <file.json[.gz]> [--replace]
// The project comes back owned by ALLOWED_GITHUB_LOGIN, who must have signed in once.
// With --replace, the current state is saved next to the other backups first.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { exportProjectJson, parseBackup, restoreProject } from '@epic/core';
import { getDb, getMongoClient, projects, users } from '@epic/db';
import { loadEnv, webEnvSchema } from '@epic/schemas/env';
import { logger } from '@epic/schemas/logger';

const env = loadEnv(
  webEnvSchema.pick({ MONGODB_URI: true, MONGODB_DB: true, ALLOWED_GITHUB_LOGIN: true }),
);
const args = process.argv.slice(2);
const replace = args.includes('--replace');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  logger.error('Usage: pnpm restore <backup.json or .json.gz> [--replace]');
  process.exit(1);
}

const db = getDb(env.MONGODB_URI, env.MONGODB_DB);
try {
  const raw = await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), file));
  const backup = parseBackup((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  const owner = await users.findByGithubLogin(db, env.ALLOWED_GITHUB_LOGIN);
  if (!owner) throw new Error('Sign in to Epic Writer once first, so the project has an owner.');

  const current = await projects.findById(db, backup.project._id);
  if (current && replace) {
    const dir = join(
      process.env.BACKUP_DIR || join(homedir(), 'EpicWriterBackups'),
      String(current._id),
    );
    await mkdir(dir, { recursive: true });
    const safety = join(
      dir,
      `before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`,
    );
    await writeFile(safety, gzipSync(await exportProjectJson(db, { project: current })));
    logger.info('saved the current state first', { file: safety });
  }
  const { rows } = await restoreProject(db, backup, { ownerId: owner._id, replace });
  logger.info('project restored', {
    project: backup.project.name,
    backupFrom: backup.exportedAt,
    rows,
  });
} catch (e) {
  logger.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await getMongoClient(env.MONGODB_URI).close();
}
