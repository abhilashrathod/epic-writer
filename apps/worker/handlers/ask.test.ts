import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  addFact,
  createEntity,
  createProject,
  listEntityTypes,
  openProject,
  saveAiKey,
  type ProjectContext,
} from '@epic/core';
import { col, jobs, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { tick } from '../worker';
import { makeAskHandler, mockAsk, PROMPT_VERSION } from './ask';

const SECRET = randomBytes(32).toString('base64');
let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let hero: string;

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
  await saveAiKey(db, user, { provider: 'anthropic', key: 'sk-test-placeholder' }, SECRET);
  const p = await createProject(db, {
    ownerId: user._id,
    name: 'Ask World',
    templateKey: 'mythological',
  });
  ctx = await openProject(db, p._id, user._id);
  const types = await listEntityTypes(db, ctx);
  const character = types.find((t) => t.traits.includes('born'))!.key;
  hero = await createEntity(db, ctx, {
    typeKey: character,
    name: 'Hero',
    fields: { status: 'alive' },
  });
  await addFact(db, ctx, {
    entityKey: hero,
    field: 'status',
    value: 'dead',
    storyTime: { start: 7200, end: null, precision: 'year' },
  });
});

async function runAsk(question: string, handler = makeAskHandler()) {
  const job = await jobs.enqueue(db, {
    ...ctx.scope,
    type: 'ask',
    input: { question, asOf: { storyTime: 3600, workKey: null, order: null } },
  });
  await tick({ db, workerId: 'w', handlers: { ask: handler }, keySecret: SECRET });
  return (await jobs.findById(db, job._id))!;
}

describe('ask handler', () => {
  it('answers from the codex, cites the card and records usage', async () => {
    const job = await runAsk('Is Hero alive?');
    expect(job.status).toBe('done');
    expect(job.output).toMatchObject({
      answer: 'The codex has a card for Hero.',
      citedKeys: [hero],
      unknown: false,
      costKnown: true,
    });
    const usage = await col(db, 'aiUsage').find({ jobId: job._id }).toArray();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ task: 'chat', promptVersion: PROMPT_VERSION, model: 'mock' });
    expect(usage[0]!.tokensIn).toBeGreaterThan(0);
    expect(job.costMicros).toBe(usage[0]!.costMicros);
  });

  it('says so when the codex has no answer', async () => {
    const job = await runAsk('Who rules the moon?');
    expect(job.output).toMatchObject({ citedKeys: [], unknown: true });
  });

  it('drops cited keys that were not among the cards, and sees only the codex as of the point', async () => {
    let seen = '';
    const handler = makeAskHandler((prompt) => {
      seen = prompt;
      return { answer: 'Yes.', citedKeys: [hero, 'made-up', hero], unknown: false };
    });
    const job = await runAsk('Is Hero alive?', handler);
    expect(job.output.citedKeys).toEqual([hero]);
    expect(seen).toContain('Status: alive');
    expect(seen).not.toContain('dead');
  });

  it('fails at once on a missing question', async () => {
    const job = await runAsk('  ');
    expect(job).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('mock names nobody when no card is in the question', () => {
    expect(mockAsk('Codex cards:\\n\\n[k1] Asha (Person)\\n\\nQuestion: who is Bhanu?')).toEqual({
      answer: 'The codex doesn’t say.',
      citedKeys: [],
      unknown: true,
    });
  });
});
