import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  createDocument,
  createEntity,
  createProject,
  createWork,
  getProposal,
  openProject,
  saveAiKey,
  saveWorkingText,
  type ProjectContext,
} from '@epic/core';
import { aiUsage, col, jobs, readHeads, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { handlers } from '../handlers';
import { tick } from '../worker';

const SECRET = randomBytes(32).toString('base64');
let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let episode: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  vi.stubEnv('AI_MOCK', '1');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const login = `u-${new ObjectId().toHexString()}`;
  const user = await users.upsertFromGithub(db, {
    githubLogin: login,
    email: `${login}@example.test`,
    name: 'U',
  });
  await saveAiKey(db, user, { provider: 'anthropic', key: 'sk-ant-test-0000' }, SECRET);
  const p = await createProject(db, { ownerId: user._id, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, user._id);
  const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  const season = await createDocument(db, ctx, { workKey, parentKey: null });
  episode = await createDocument(db, ctx, { workKey, parentKey: season });
  const character = (await readHeads(db, 'entityTypes', ctx.scope)).find(
    (t) => t.name === 'Character',
  )!.key;
  await createEntity(db, ctx, { typeKey: character, name: 'Arjuna' });
  await saveWorkingText(db, ctx, {
    documentKey: episode,
    text: 'INT. PALACE - DAY [[@s:s1]]\n\nArjuna bows to Drona.\n\nEXT. FIELD [[@s:s2]]\n\nKunti waits.',
    baseVersion: 0,
  });
});

const run = async (input: Record<string, unknown>) => {
  const job = await jobs.enqueue(db, { ...ctx.scope, type: 'extract', input });
  await tick({ db, workerId: 'w', handlers, keySecret: SECRET });
  return (await jobs.findById(db, job._id))!;
};

describe('extract handler', () => {
  it('writes one proposal from the mock model, records usage and never touches the codex', async () => {
    const before = await col(db, 'commits').countDocuments({ projectId: ctx.project._id });
    const job = await run({ documentKey: episode });
    expect(job).toMatchObject({ status: 'done', output: { changes: 2, costKnown: true } });
    const p = await getProposal(db, ctx, job.output.proposalId as string);
    // Arjuna is already in the codex, so only Drona and Kunti are proposed.
    expect(p.changes.map((c) => c.payload.name)).toEqual(['Drona', 'Kunti']);
    expect(p).toMatchObject({ status: 'pending', scope: 'document', model: 'mock' });
    expect(await col(db, 'commits').countDocuments({ projectId: ctx.project._id })).toBe(before);
    const spend = await aiUsage.spend(db, ctx.project._id, new Date(0));
    expect(spend.byTask.extraction).toBeGreaterThanOrEqual(0);
    expect(await col(db, 'aiUsage').findOne({ jobId: job._id })).toMatchObject({
      task: 'extraction',
      promptVersion: 'extract-1',
    });
  });

  it('extracts one scene, and fails at once on bad input', async () => {
    const job = await run({ documentKey: episode, sceneKey: 's2' });
    const p = await getProposal(db, ctx, job.output.proposalId as string);
    expect(p.changes.map((c) => c.payload.name)).toEqual(['Kunti']);
    expect(p.source.text).toBe('EXT. FIELD\n\nKunti waits.');
    expect(await run({})).toMatchObject({ status: 'failed', attempts: 1 });
  });
});
