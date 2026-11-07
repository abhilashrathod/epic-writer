import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { createTestDb } from '@epic/db/testing';
import {
  dismissIssue,
  listIssues,
  locateQuotedIssues,
  prepareContinuity,
  storeContinuityRun,
} from './continuity';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { listEntityTypes } from './entity-types';
import { NotFound } from './errors';
import { addFact } from './facts';
import { saveWorkingText } from './save';
import {
  createDocument,
  createWork,
  openProject,
  setDocumentStoryTime,
  type ProjectContext,
} from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let episode: string;
let hero: string;
let version: number;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, userId);
  const T = Object.fromEntries((await listEntityTypes(db, ctx)).map((t) => [t.name, t.key]));
  hero = await createEntity(db, ctx, { typeKey: T.Character, name: 'Bhishma' });
  await addFact(db, ctx, {
    entityKey: hero,
    field: 'status',
    value: 'dead',
    storyTime: { start: 100, end: null, precision: 'day' },
  });
  const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  const season = await createDocument(db, ctx, { workKey, parentKey: null });
  episode = await createDocument(db, ctx, { workKey, parentKey: season });
  await setDocumentStoryTime(db, ctx, episode, { start: 200, end: null, precision: 'day' });
  version = 0;
  await save(TEXT());
});

const CUE = () => `[[@e:${hero}|BHISHMA]]`;
const TEXT = (before = '') =>
  [`${before}INT. HALL - DAY [[@s:s1]]`, '', 'Torches burn.', '', CUE(), 'I return.'].join('\n');
const save = async (text: string) =>
  ({ version } = await saveWorkingText(db, ctx, {
    documentKey: episode,
    text,
    baseVersion: version,
  }));

async function check() {
  const run = await prepareContinuity(db, ctx, episode);
  return { run, counts: await storeContinuityRun(db, ctx, run, run.found) };
}

describe('continuity issues', () => {
  it('runs the rules against the world as of the episode and lists the issues', async () => {
    const { run, counts } = await check();
    expect(counts).toEqual({ open: 1, dismissed: 0 });
    expect(run.context).toContain('Bhishma');
    expect(run.context).toContain('Status: dead');
    const [issue] = await listIssues(db, ctx, episode);
    expect(issue).toMatchObject({
      rule: 'dead-character-acts',
      severity: 'error',
      status: 'open',
      sceneKey: 's1',
      quote: CUE(),
      relatedKeys: [hero],
    });
  });

  it('shifts ranges for edits elsewhere and marks edited issues stale on save', async () => {
    await check();
    await save(TEXT('.'));
    const [moved] = await listIssues(db, ctx, episode);
    expect(moved).toMatchObject({ status: 'open', quote: CUE() });

    await save(TEXT('.').replace('BHISHMA]]', 'BHISHM]]'));
    const [stale] = await listIssues(db, ctx, episode);
    expect(stale).toMatchObject({ status: 'stale', quote: '' });
  });

  it('keeps a dismissed issue dismissed when the same issue recurs, and replaces open ones', async () => {
    await check();
    const [issue] = await listIssues(db, ctx, episode);
    await dismissIssue(db, ctx, issue!.id);
    expect(await listIssues(db, ctx, episode)).toEqual([]);
    const { counts } = await check();
    expect(counts).toEqual({ open: 0, dismissed: 1 });
    expect(await listIssues(db, ctx, episode)).toEqual([]);
  });

  it('locates AI quotes in the stored text and drops the ones it can’t find', async () => {
    const run = await prepareContinuity(db, ctx, episode);
    const base = { rule: 'unpaid-setup' as const, severity: 'info' as const, message: 'm' };
    const found = locateQuotedIssues(run, [
      { ...base, quote: 'BHISHMA\nI return', relatedKeys: [hero, 'made-up'] },
      { ...base, quote: 'Not in the text', relatedKeys: [] },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sceneKey: 's1', relatedKeys: [hero] });
    expect(run.text.slice(found[0]!.range.from, found[0]!.range.to)).toBe(`${CUE()}\nI return`);
  });

  it('rejects unknown issue ids', async () => {
    await expect(dismissIssue(db, ctx, 'nope')).rejects.toBeInstanceOf(NotFound);
    await expect(dismissIssue(db, ctx, new ObjectId().toHexString())).rejects.toBeInstanceOf(
      NotFound,
    );
  });
});
