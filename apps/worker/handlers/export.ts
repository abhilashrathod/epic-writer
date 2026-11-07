import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type { Db, ObjectId } from 'mongodb';
import { exportProjectJson, Invalid, NotFound } from '@epic/core';
import { backups, jobs, projects } from '@epic/db';
import type { JobHandler } from '../handlers';

export const KEEP_BACKUPS = 14;
export const BACKUP_EVERY_MS = 24 * 60 * 60_000;
const FILE_RE = /^\d{4}-\d{2}-\d{2}\.json\.gz$/;
const gzipAsync = promisify(gzip);

/** Deletes all but the newest `keep` backups in a project folder. Names sort by date. */
export async function pruneBackups(folder: string, keep = KEEP_BACKUPS): Promise<void> {
  const files = (await readdir(folder)).filter((f) => FILE_RE.test(f)).sort();
  await Promise.all(files.slice(0, -keep).map((f) => rm(join(folder, f))));
}

/** Writes `<dir>/<projectId>/<YYYY-MM-DD>.json.gz` (UTC date), then prunes old ones. */
export async function writeBackup(
  dir: string,
  projectId: string,
  json: string,
  now = new Date(),
): Promise<{ path: string; bytes: number }> {
  const folder = join(dir, projectId);
  await mkdir(folder, { recursive: true });
  const data = await gzipAsync(json);
  const path = join(folder, `${now.toISOString().slice(0, 10)}.json.gz`);
  // Write then rename, so a crash never leaves a truncated file under a backup's name.
  await writeFile(`${path}.tmp`, data);
  await rename(`${path}.tmp`, path);
  await pruneBackups(folder);
  return { path, bytes: data.length };
}

/** Nightly project backup (IO-7) into BACKUP_DIR. */
export const exportBackup: JobHandler = async (job, ctx) => {
  if (!ctx.backupDir) throw new Invalid('BACKUP_DIR is not set, so there is nowhere to write');
  const project = await projects.findById(ctx.db, job.projectId);
  if (!project) throw new NotFound('Project not found');
  const json = await exportProjectJson(ctx.db, { project });
  return writeBackup(ctx.backupDir, project._id.toHexString(), json);
};

/** Projects with no queued, running or finished export job in the last 24 hours. */
export function projectsDueForBackup<P extends { _id: ObjectId }>(
  all: P[],
  recent: { projectId: ObjectId; createdAt: Date }[],
  now: Date,
): P[] {
  const since = now.getTime() - BACKUP_EVERY_MS;
  const fresh = new Set(
    recent.filter((j) => j.createdAt.getTime() > since).map((j) => j.projectId.toHexString()),
  );
  return all.filter((p) => !fresh.has(p._id.toHexString()));
}

/** Enqueues an export job for every project due a backup. Returns how many were queued. */
export async function scheduleBackups(db: Db, now = new Date()): Promise<number> {
  const [all, recent] = await Promise.all([
    backups.listProjects(db),
    // A failed backup (e.g. an unwritable BACKUP_DIR) waits an hour before the next try, so a
    // persistent failure can't queue a new failing job every 10 minutes.
    backups.recentExportJobs(
      db,
      new Date(now.getTime() - BACKUP_EVERY_MS),
      new Date(now.getTime() - 60 * 60_000),
    ),
  ]);
  const due = projectsDueForBackup(all, recent, now);
  for (const p of due)
    await jobs.enqueue(db, { projectId: p._id, branchId: p.mainBranchId, type: 'export' });
  return due.length;
}
