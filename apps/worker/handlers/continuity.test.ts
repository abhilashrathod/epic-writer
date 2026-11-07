import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from 'mongodb';
import {
  createDocument,
  createEntity,
  createProject,
  createWork,
  enqueueAiJob,
  listEntityTypes,
  listIssues,
  openProject,
  saveAiKey,
  saveWorkingText,
  setDocumentStoryTime,
} from '@epic/core';
import { col, jobs, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { handlers } from '../handlers';
import { tick } from '../worker';
import { mockContinuity, PROMPT_VERSION } from './continuity';

const SECRET = randomBytes(32).toString('base64');
let db: Db;
let drop: () => Promise<void>;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(() => {
  vi.stubEnv('AI_MOCK', '1');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
});

describe('continuity handler', () => {
  it('runs the rules and the AI pass, stores issues and records usage', async () => {
    const user = await users.upsertFromGithub(db, {
      githubLogin: 'cont',
      email: 'cont@example.test',
      name: 'C',
    });
    await saveAiKey(db, user, { provider: 'anthropic', key: 'not-a-real-key-for-tests' }, SECRET);
    const p = await createProject(db, {
      ownerId: user._id,
      name: 'W',
      templateKey: 'mythological',
    });
    const ctx = await openProject(db, p._id, user._id);
    const T = Object.fromEntries((await listEntityTypes(db, ctx)).map((t) => [t.name, t.key]));
    const hero = await createEntity(db, ctx, {
      typeKey: T.Character,
      name: 'Bhishma',
      fields: { died: { start: 10, end: null, precision: 'day' } },
    });
    const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
    const season = await createDocument(db, ctx, { workKey, parentKey: null });
    const episode = await createDocument(db, ctx, { workKey, parentKey: season });
    await setDocumentStoryTime(db, ctx, episode, { start: 50, end: null, precision: 'day' });
    const text = [
      'INT. HALL - DAY [[@s:s1]]',
      '',
      'A sealed chest waits by the throne.',
      '',
      `[[@e:${hero}|BHISHMA]]`,
      'I am back.',
    ].join('\n');
    await saveWorkingText(db, ctx, { documentKey: episode, text, baseVersion: 0 });

    const job = await enqueueAiJob(db, ctx, 'continuity', { documentKey: episode });
    await tick({ db, workerId: 'w', handlers, keySecret: SECRET });

    const done = (await jobs.findById(db, job._id))!;
    expect(done.status).toBe('done');
    expect(done.output).toMatchObject({ open: 2, dismissed: 0, rules: 1, ai: 1 });
    const issues = await listIssues(db, ctx, episode);
    expect(issues.map((i) => [i.rule, i.quote])).toEqual([
      ['unpaid-setup', 'A sealed chest waits by the throne.'],
      ['dead-character-acts', `[[@e:${hero}|BHISHMA]]`],
    ]);
    expect(await col(db, 'aiUsage').findOne({ jobId: job._id })).toMatchObject({
      task: 'continuity',
      promptVersion: PROMPT_VERSION,
    });
  });

  it('mock answers nothing when no line qualifies', () => {
    expect(mockContinuity('TEXT:\\nINT. HALL')).toEqual({ issues: [] });
  });
});
