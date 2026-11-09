import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import {
  applyTypeTemplate,
  createDocument,
  createEntity,
  createProject,
  createWork,
  getProposal,
  openProject,
  saveAiKey,
  saveWorkingText,
  TYPE_CATALOGUE,
  type ProjectContext,
} from '@epic/core';
import { chunks, col, jobs, projectSettings, readHeadByKey, readHeads, users } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { handlers } from '../handlers';
import { tick } from '../worker';

const spy = vi.hoisted(() => ({
  sent: [] as string[],
  answer: null as ((opts: { schema: unknown; prompt: string }) => unknown) | null,
  models: [] as string[],
}));

vi.mock('@epic/ai', async (original) => {
  const real = await original<typeof import('@epic/ai')>();
  return {
    ...real,
    languageModel: (...args: Parameters<typeof real.languageModel>) => {
      spy.models.push(args[1]);
      return real.languageModel(...args);
    },
    generateStructured: async (opts: Parameters<typeof real.generateStructured>[0]) => {
      spy.sent.push([opts.system, opts.stable ?? '', opts.prompt].join('\n'));
      const res = await real.generateStructured(opts);
      return { ...res, object: spy.answer?.(opts) ?? res.object };
    },
  };
});

const SECRET = randomBytes(32).toString('base64');
const HIDDEN = 'PRIVATE-NOTE-MARKER rework the ending. '.repeat(20);
const CASTING = 'CASTING-MARKER';
const BACKSTORY = 'Raised by river folk after the flood. '.repeat(20);
const FATE = 'FATE-MARKER he falls at the ford.';
const SCENE = 'INT. PALACE - DAY [[@s:s1]]\n\n[[@e:KEY|Arjuna]] bows to Drona. His hair is black.';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let episode: string;
let arjuna: string;
let workKey: string;
let seasonKey: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  vi.stubEnv('AI_MOCK', '1');
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  spy.sent.length = 0;
  spy.models.length = 0;
  spy.answer = null;
  const login = `u-${new ObjectId().toHexString()}`;
  const user = await users.upsertFromGithub(db, {
    githubLogin: login,
    email: `${login}@example.test`,
    name: 'U',
  });
  await saveAiKey(db, user, { provider: 'anthropic', key: 'sk-ant-test-0000' }, SECRET);
  const p = await createProject(db, { ownerId: user._id, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, user._id);
  // The worst case for prompt size: every catalogue type installed.
  for (const t of TYPE_CATALOGUE) {
    ctx = await openProject(db, p._id, user._id);
    await applyTypeTemplate(db, ctx, t.id);
  }
  ctx = await openProject(db, p._id, user._id);
  workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  const season = await createDocument(db, ctx, { workKey, parentKey: null });
  seasonKey = season;
  episode = await createDocument(db, ctx, { workKey, parentKey: season, title: 'Early Oath' });
  const character = (await readHeads(db, 'entityTypes', ctx.scope)).find(
    (t) => t.name === 'Character',
  )!.key;
  arjuna = await createEntity(db, ctx, {
    typeKey: character,
    name: 'Arjuna',
    fields: { backstory: BACKSTORY, fate: FATE, notes: HIDDEN, castingNotes: CASTING },
  });
  await saveWorkingText(db, ctx, {
    documentKey: episode,
    text: SCENE.replace('KEY', arjuna),
    baseVersion: 0,
  });
}, 60_000);

const run = async (type: 'extract' | 'ask' | 'continuity', input: Record<string, unknown>) => {
  const job = await jobs.enqueue(db, { ...ctx.scope, type, input });
  await tick({ db, workerId: 'w', handlers, keySecret: SECRET });
  return (await jobs.findById(db, job._id))!;
};

/** The single-pass prompt this replaced, with every field of every type and every entry. */
async function promptBefore(text: string): Promise<number> {
  const types = await readHeads(db, 'entityTypes', ctx.scope);
  const linkTypes = await readHeads(db, 'linkTypes', ctx.scope);
  const entries = await readHeads(db, 'entities', ctx.scope);
  const lines = types.map(
    (t) =>
      `- ${t.name} (fields: ${t.fields.map((f) => `${f.label} (${f.kind}${f.options.length ? `: ${f.options.join(' | ')}` : ''}${f.timeVarying ? ', changes over time' : ''})`).join('; ')})`,
  );
  const links = linkTypes.map((l) => `- "${l.label}" (reverse "${l.inverseLabel}")`);
  const known = entries.map((e) => `- ${e.name}`);
  return [lines, links, known, [text]].flat().join('\n').length;
}

const allOutput = () => spy.sent.join('\n');

describe('AI field access', () => {
  it('end to end: two passes, smaller prompt, no read or hidden field proposed', async () => {
    spy.answer = (opts) =>
      opts.prompt.includes('Codex entries:')
        ? {
            entries: [
              {
                name: 'Arjuna',
                type: 'Character',
                aliases: [],
                summary: '',
                sameAs: null,
                confidence: 0.9,
                quote: 'Arjuna bows',
                fields: [
                  { field: 'Hair', value: 'black', confidence: 0.9 },
                  { field: 'Backstory', value: 'invented', confidence: 0.9 },
                  { field: 'Fate', value: 'invented', confidence: 0.9 },
                  { field: 'Notes (private)', value: 'invented', confidence: 0.9 },
                  { field: 'Casting notes', value: 'invented', confidence: 0.9 },
                ],
              },
            ],
            facts: [],
            links: [],
          }
        : null;
    const job = await run('extract', { documentKey: episode });
    expect(job.status).toBe('done');

    const usage = await col(db, 'aiUsage').find({ jobId: job._id }).sort({ _id: 1 }).toArray();
    expect(usage.map((u) => u.pass)).toEqual(['mentions', 'fields']);
    const after = usage.reduce((n, u) => n + u.promptChars!, 0);
    const before = await promptBefore(SCENE);
    expect(after).toBeLessThan(before / 2);

    const pass2 = spy.sent[1]!;
    for (const label of ['Backstory', 'Fate (', 'Casting notes', 'Notes (private)'])
      expect(pass2, label).not.toContain(label);
    expect(pass2).toContain('Hair (text)');
    expect(pass2).not.toContain('Dwelling kind');

    const p = await getProposal(db, ctx, job.output.proposalId as string);
    expect(p.changes.map((c) => c.payload.field)).toEqual(['hair']);
    expect(p.warnings.join(' ')).toMatch(/Ignored 4 values/);
  }, 30_000);

  it('never sends a hidden field to any prompt or chunk', async () => {
    await run('extract', { documentKey: episode });
    const asOf = { storyTime: null, workKey: null, order: null };
    expect(
      await run('ask', { question: 'What happened to Arjuna by the river?', asOf }),
    ).toMatchObject({
      status: 'done',
    });
    expect(await run('continuity', { documentKey: episode })).toMatchObject({ status: 'done' });

    expect(spy.sent.length).toBeGreaterThanOrEqual(4);
    expect(allOutput()).not.toContain('PRIVATE-NOTE-MARKER');
    expect(allOutput()).not.toContain(CASTING);

    const rows = await chunks.listForKind(db, ctx.scope, 'entity');
    expect(rows.some((c) => c.text.includes('river folk'))).toBe(true);
    expect(rows.map((c) => c.text).join(' ')).not.toContain('PRIVATE-NOTE-MARKER');
    expect(rows.every((c) => !c.sourceKey.includes('#notes#'))).toBe(true);
  }, 30_000);

  it('leaves planned endings out of Ask unless the question opts in', async () => {
    const asOf = { storyTime: null, workKey: null, order: null };
    await run('ask', { question: 'What became of Arjuna?', asOf });
    expect(spy.sent.join('\n')).not.toContain('FATE-MARKER');
    spy.sent.length = 0;
    await run('ask', { question: 'What became of Arjuna?', asOf, includePlanned: true });
    expect(spy.sent.join('\n')).toContain('FATE-MARKER');
    spy.sent.length = 0;
    await run('continuity', { documentKey: episode });
    expect(spy.sent.join('\n')).toContain('FATE-MARKER');
  }, 30_000);

  it('uses the classification model slot and each type description on pass 1', async () => {
    await projectSettings.setAiSettings(db, ctx.project._id, {
      ...ctx.project.aiSettings,
      models: { ...ctx.project.aiSettings.models, classification: 'my-cheap-one' },
    });
    const job = await run('extract', { documentKey: episode });
    expect(spy.sent[0]).toContain('Character — Any person, mortal or not');
    const usage = await col(db, 'aiUsage').find({ jobId: job._id, pass: 'mentions' }).toArray();
    expect(usage).toHaveLength(1);
    expect(spy.models).toContain('my-cheap-one');
  }, 30_000);

  it('shows only narrative references already reached as of the point', async () => {
    await createDocument(db, ctx, { workKey, parentKey: seasonKey, title: 'Late Reckoning' });
    const first = await readHeadByKey(db, 'documents', ctx.scope, episode);
    const setup = (await readHeads(db, 'entityTypes', ctx.scope)).find(
      (t) => t.name === 'Setup / Payoff',
    )!.key;
    await createEntity(db, ctx, {
      typeKey: setup,
      name: 'Bow Promise',
      fields: { paidOffAt: ['Early Oath', 'Late Reckoning', 'somewhere vague'] },
    });
    const asOf = { storyTime: null, workKey, order: `${first!.orderPath}.9999` };
    const ask = (over = {}) => run('ask', { question: 'What of Bow Promise?', asOf, ...over });

    await ask();
    expect(allOutput()).toContain('Paid off at: Early Oath');
    expect(allOutput()).not.toMatch(/Late Reckoning|somewhere vague/);

    spy.sent.length = 0;
    await ask({ includePlanned: true });
    expect(allOutput()).toContain('Paid off at: Early Oath, Late Reckoning, somewhere vague');
  }, 30_000);

  it('gives relevant long read fields in full and only names the others', async () => {
    const asOf = { storyTime: null, workKey: null, order: null };
    await run('ask', { question: 'What happened by the river after the flood?', asOf });
    expect(allOutput()).toContain(BACKSTORY.trim());
  }, 30_000);
});
