import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { aiUsage, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import {
  decryptAiKey,
  deleteAiKey,
  enqueueAiJob,
  getAiSettings,
  saveAiKey,
  updateAiSettings,
} from './ai';
import { createProject } from './create-project';
import { Forbidden, Invalid } from './errors';
import { openProject, type ProjectContext } from './works';

const SECRET = randomBytes(32).toString('base64');
let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const login = `u-${new ObjectId().toHexString()}`;
  const user = await users.upsertFromGithub(db, {
    githubLogin: login,
    email: `${login}@example.test`,
    name: 'U',
  });
  const p = await createProject(db, {
    ownerId: user._id,
    name: 'Test World',
    templateKey: 'blank',
  });
  ctx = await openProject(db, p._id, user._id);
});

const owner = async () => (await users.findById(db, ctx.userId))!;
const settings = {
  provider: 'anthropic',
  models: { extraction: '', continuity: '', suggestions: '', chat: '', embedding: '' },
  monthlyCapMicros: 0,
};

describe('AI keys', () => {
  it('stores keys encrypted, shows only label and last four, and replaces per provider', async () => {
    const shown = await saveAiKey(
      db,
      await owner(),
      { provider: 'anthropic', key: 'sk-ant-secret-ABCD', label: 'Personal' },
      SECRET,
    );
    expect(shown).toEqual([{ provider: 'anthropic', label: 'Personal', last4: 'ABCD' }]);
    const stored = (await owner()).aiKeys[0]!;
    expect(JSON.stringify(stored)).not.toContain('secret');
    expect(decryptAiKey(await owner(), 'anthropic', SECRET)).toBe('sk-ant-secret-ABCD');

    await saveAiKey(db, await owner(), { provider: 'anthropic', key: 'sk-ant-other-WXYZ' }, SECRET);
    expect((await owner()).aiKeys).toHaveLength(1);
    await deleteAiKey(db, await owner(), 'anthropic');
    expect(decryptAiKey(await owner(), 'anthropic', SECRET)).toBeNull();
  });
});

describe('AI settings and jobs', () => {
  it('saves settings and reports spend this month by task', async () => {
    await updateAiSettings(db, ctx, {
      ...settings,
      models: { ...settings.models, chat: 'claude-haiku-5-5' },
      monthlyCapMicros: 5_000_000,
    });
    ctx = await openProject(db, ctx.project._id, ctx.userId);
    await aiUsage.record(db, {
      projectId: ctx.project._id,
      jobId: null,
      task: 'extraction',
      provider: 'anthropic',
      model: 'm',
      promptVersion: 'v1',
      tokensIn: 1,
      tokensOut: 1,
      costMicros: 1200,
      at: new Date(),
    });
    const s = await getAiSettings(db, ctx);
    expect(s).toMatchObject({
      provider: 'anthropic',
      monthlyCapMicros: 5_000_000,
      spend: { monthTotal: 1200, byTask: { extraction: 1200 } },
    });
    expect(s.models.chat).toBe('claude-haiku-5-5');
  });

  it('refuses to queue without a key, or past the monthly cap', async () => {
    await expect(enqueueAiJob(db, ctx, 'extract', {})).rejects.toBeInstanceOf(Invalid);
    await saveAiKey(
      db,
      await owner(),
      { provider: 'anthropic', key: 'sk-ant-secret-ABCD' },
      SECRET,
    );
    const job = await enqueueAiJob(db, ctx, 'extract', { documentKey: 'd1' });
    expect(job).toMatchObject({ type: 'extract', status: 'queued', input: { documentKey: 'd1' } });

    await updateAiSettings(db, ctx, { ...settings, monthlyCapMicros: 1000 });
    ctx = await openProject(db, ctx.project._id, ctx.userId);
    await aiUsage.record(db, {
      projectId: ctx.project._id,
      jobId: null,
      task: 'chat',
      provider: 'anthropic',
      model: 'm',
      promptVersion: 'v1',
      tokensIn: 1,
      tokensOut: 1,
      costMicros: 1000,
      at: new Date(),
    });
    await expect(enqueueAiJob(db, ctx, 'ask', {})).rejects.toBeInstanceOf(Forbidden);
  });
});
