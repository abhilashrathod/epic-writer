import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BSON, ObjectId, type Db } from 'mongodb';
import { createProject, type ProjectBackup } from '@epic/core';
import { col, jobs } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { handlers } from '../handlers';
import { tick } from '../worker';
import {
  BACKUP_EVERY_MS,
  KEEP_BACKUPS,
  projectsDueForBackup,
  pruneBackups,
  scheduleBackups,
  writeBackup,
} from './export';

let db: Db;
let drop: () => Promise<void>;
let dir: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  dir = await mkdtemp(join(tmpdir(), 'epic-backup-test-'));
  return () => rm(dir, { recursive: true, force: true });
});

describe('export handler', () => {
  it('writes a gzipped EJSON backup of the project', async () => {
    const p = await createProject(db, {
      ownerId: new ObjectId(),
      name: 'Backup World',
      templateKey: 'blank',
    });
    const job = await jobs.enqueue(db, {
      projectId: p._id,
      branchId: p.mainBranchId,
      type: 'export',
    });
    await col(db, 'jobs').updateMany(
      { _id: { $ne: job._id }, status: 'queued' },
      { $set: { status: 'cancelled' } },
    );

    await tick({ db, workerId: 'w', handlers, backupDir: dir });
    const done = await jobs.findById(db, job._id);
    expect(done?.status).toBe('done');
    const path = done!.output.path as string;
    expect(path).toBe(
      join(dir, p._id.toHexString(), `${new Date().toISOString().slice(0, 10)}.json.gz`),
    );
    const raw = await readFile(path);
    expect(done!.output.bytes).toBe(raw.length);
    const backup = BSON.EJSON.parse(gunzipSync(raw).toString()) as ProjectBackup;
    expect(backup.project.name).toBe('Backup World');
    expect(backup.collections.branches).toHaveLength(1);
  });

  it('fails without retrying when BACKUP_DIR is unset', async () => {
    const p = await createProject(db, {
      ownerId: new ObjectId(),
      name: 'No Dir',
      templateKey: 'blank',
    });
    const job = await jobs.enqueue(db, {
      projectId: p._id,
      branchId: p.mainBranchId,
      type: 'export',
    });
    await col(db, 'jobs').updateMany(
      { _id: { $ne: job._id }, status: 'queued' },
      { $set: { status: 'cancelled' } },
    );
    await tick({ db, workerId: 'w', handlers });
    expect((await jobs.findById(db, job._id))?.status).toBe('failed');
  });
});

describe('writeBackup and pruneBackups', () => {
  it(`keeps the newest ${KEEP_BACKUPS} backups and ignores other files`, async () => {
    const folder = join(dir, 'p1');
    await writeBackup(dir, 'p1', '{}', new Date('2026-01-01T03:00:00Z'));
    for (let d = 2; d <= 20; d++)
      await writeFile(join(folder, `2026-01-${String(d).padStart(2, '0')}.json.gz`), 'x');
    await writeFile(join(folder, 'notes.txt'), 'keep me');
    await pruneBackups(folder);
    const files = (await readdir(folder)).sort();
    expect(files).toHaveLength(KEEP_BACKUPS + 1);
    expect(files[0]).toBe('2026-01-07.json.gz');
    expect(files).toContain('notes.txt');
  });
});

describe('nightly scheduling', () => {
  const now = new Date('2026-06-02T12:00:00Z');
  const a = { _id: new ObjectId() };
  const b = { _id: new ObjectId() };
  const c = { _id: new ObjectId() };

  it('picks projects without an export job in the last 24 hours', () => {
    const recent = [
      { projectId: a._id, createdAt: new Date(now.getTime() - 60_000) },
      { projectId: b._id, createdAt: new Date(now.getTime() - BACKUP_EVERY_MS - 1) },
    ];
    expect(projectsDueForBackup([a, b, c], recent, now)).toEqual([b, c]);
    expect(projectsDueForBackup([a], [], now)).toEqual([a]);
  });

  it('enqueues once per project per day', async () => {
    const p = await createProject(db, {
      ownerId: new ObjectId(),
      name: 'Nightly',
      templateKey: 'blank',
    });
    const count = () => col(db, 'jobs').countDocuments({ projectId: p._id, type: 'export' });
    await scheduleBackups(db, now);
    expect(await count()).toBe(1);
    await scheduleBackups(db, new Date(now.getTime() + 60_000));
    expect(await count()).toBe(1);
  });

  it('waits an hour after a failed backup before trying again', async () => {
    const p = await createProject(db, {
      ownerId: new ObjectId(),
      name: 'Failing',
      templateKey: 'blank',
    });
    const count = () => col(db, 'jobs').countDocuments({ projectId: p._id, type: 'export' });
    const start = new Date();
    await scheduleBackups(db, start);
    await col(db, 'jobs').updateMany(
      { projectId: p._id, type: 'export' },
      { $set: { status: 'failed' } },
    );
    await scheduleBackups(db, new Date(start.getTime() + 30 * 60_000));
    expect(await count()).toBe(1);
    await scheduleBackups(db, new Date(start.getTime() + 61 * 60_000));
    expect(await count()).toBe(2);
  });
});
