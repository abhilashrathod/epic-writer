import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { col, jobs } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { handlers as realHandlers, type Handlers } from './handlers';
import { backoffMs, LOCK_MS, MAX_ATTEMPTS, runLoop, tick } from './worker';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  await col(db, 'jobs').deleteMany({});
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

const scope = { projectId: new ObjectId(), branchId: new ObjectId() };
const workerId = 'test-worker';
const enqueue = (type: 'noop' | 'extract' = 'noop') => jobs.enqueue(db, { ...scope, type });
const reload = async (id: ObjectId) => (await jobs.findById(db, id))!;

describe('worker', () => {
  it('runs a noop job to done', async () => {
    const job = await enqueue();
    const ran = await tick({ db, workerId, handlers: realHandlers });
    expect(ran?._id).toEqual(job._id);
    expect(await reload(job._id)).toMatchObject({
      status: 'done',
      attempts: 1,
      output: { ok: true },
      lockedBy: null,
      lockedUntil: null,
    });
  });

  it('returns null on an empty queue and skips jobs not yet due', async () => {
    await jobs.enqueue(db, { ...scope, type: 'noop', runAfter: new Date(Date.now() + 60_000) });
    expect(await tick({ db, workerId, handlers: realHandlers })).toBeNull();
  });

  it('retries a failing job with backoff, then fails it after 3 attempts', async () => {
    const failing: Handlers = { noop: () => Promise.reject(new Error('boom')) };
    const job = await enqueue();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const before = Date.now();
      await tick({ db, workerId, handlers: failing });
      const row = await reload(job._id);
      expect(row).toMatchObject({ attempts: attempt, error: 'boom', lockedBy: null });
      if (attempt < MAX_ATTEMPTS) {
        expect(row.status).toBe('queued');
        expect(row.runAfter.getTime()).toBeGreaterThanOrEqual(before + backoffMs(attempt));
        await col(db, 'jobs').updateOne({ _id: job._id }, { $set: { runAfter: new Date() } });
      } else {
        expect(row.status).toBe('failed');
      }
    }
  });

  it('fails a job with no handler without retrying', async () => {
    const job = await enqueue('extract');
    await tick({ db, workerId, handlers: realHandlers });
    expect(await reload(job._id)).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('reclaims a job whose lock expired, and fails it if that was the last attempt', async () => {
    const stale = { status: 'running' as const, lockedBy: 'dead', lockedUntil: new Date(Date.now() - 1) };
    const a = await enqueue();
    const b = await enqueue();
    await col(db, 'jobs').updateOne({ _id: a._id }, { $set: { ...stale, attempts: 1 } });
    await col(db, 'jobs').updateOne({ _id: b._id }, { $set: { ...stale, attempts: MAX_ATTEMPTS } });
    await tick({ db, workerId, handlers: realHandlers });
    expect(await reload(a._id)).toMatchObject({ status: 'done', attempts: 2 });
    expect(await reload(b._id)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('does not take a job another worker holds a live lock on', async () => {
    const job = await enqueue();
    const lockedUntil = new Date(Date.now() + LOCK_MS);
    await col(db, 'jobs').updateOne(
      { _id: job._id },
      { $set: { status: 'running', lockedBy: 'other', lockedUntil } },
    );
    expect(await tick({ db, workerId, handlers: realHandlers })).toBeNull();
  });

  it('on abort, finishes the running job before the loop returns, and writes a heartbeat', async () => {
    const job = await enqueue();
    const stop = new AbortController();
    const loop = runLoop({ db, workerId, handlers: realHandlers, pollMs: 50 }, stop.signal);
    await vi.waitFor(async () => expect((await reload(job._id)).status).toBe('running'));
    stop.abort();
    await loop;
    expect((await reload(job._id)).status).toBe('done');
    expect(await jobs.lastHeartbeat(db)).toBeInstanceOf(Date);
    expect(await tick({ db, workerId, handlers: realHandlers })).toBeNull(); // heartbeat row is never claimed
  });
});
