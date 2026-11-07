import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { jobs, readHeads, users, type ProposalDoc } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import { saveAiKey } from './ai';
import { createProject } from './create-project';
import { Invalid } from './errors';
import {
  extractImportedNotes,
  IMPORTED_NOTES_WORK,
  importNotes,
  importStatus,
  splitNote,
} from './import-notes';
import { extractionSource, saveProposal } from './proposals';
import { getTree, getWorkingText, openProject, type ProjectContext } from './works';

const SECRET = Buffer.alloc(32, 7).toString('base64');

describe('splitNote', () => {
  it('keeps short text as one part, trimmed, with Windows line ends normalised', () => {
    expect(splitNote('  One.\r\n\r\nTwo.  ')).toEqual(['One.\n\nTwo.']);
    expect(splitNote(' \n ')).toEqual([]);
  });

  it('splits long text at paragraph boundaries without losing words', () => {
    const paras = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'word '.repeat(20)}`);
    const parts = splitNote(paras.join('\n\n'), 500);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(500);
    expect(parts.join('\n\n')).toBe(paras.map((p) => p.trim()).join('\n\n'));
  });

  it('starts a new part at a heading once the current part is half full', () => {
    const body = 'x'.repeat(400);
    const parts = splitNote(`# One\n\n${body}\n\n# Two\n\n${body}`, 700);
    expect(parts).toEqual([`# One\n\n${body}`, `# Two\n\n${body}`]);
  });

  it('cuts an over-long paragraph at lines, then at the limit', () => {
    const parts = splitNote(`${'a'.repeat(250)}\n${'b'.repeat(50)}`, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join('').replace(/\n/g, '')).toBe('a'.repeat(250) + 'b'.repeat(50));
  });
});

describe('importing notes', () => {
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
    const p = await createProject(db, { ownerId: user._id, name: 'World', templateKey: 'blank' });
    ctx = await openProject(db, p._id, user._id);
  });

  it('creates note documents in one "Imported notes" work, splitting long files', async () => {
    const long = Array.from({ length: 40 }, () => 'A sentence about the river. '.repeat(30)).join(
      '\n\n',
    );
    const first = await importNotes(db, ctx, [
      { name: 'Places.md', text: '# Places\n\nThe river town.' },
      { name: 'History.txt', text: long },
    ]);
    const again = await importNotes(db, ctx, [{ name: 'More.docx', text: 'More notes.' }]);
    expect(again.workKey).toBe(first.workKey);

    const { works, documents } = await getTree(db, ctx);
    expect(works.map((w) => [w.name, w.medium])).toEqual([[IMPORTED_NOTES_WORK, 'other']]);
    expect(documents.every((d) => d.contentType === 'note' && d.format === 'markdown')).toBe(true);
    expect(documents.map((d) => d.title)).toEqual([
      'Places',
      'History (part 1)',
      'History (part 2)',
      'More',
    ]);
    expect((await getWorkingText(db, ctx, first.documents[0]!.key)).text).toBe(
      '# Places\n\nThe river town.',
    );
  });

  it('refuses a file with no text before creating anything', async () => {
    await expect(
      importNotes(db, ctx, [
        { name: 'a.md', text: 'Fine' },
        { name: 'b.txt', text: '  ' },
      ]),
    ).rejects.toBeInstanceOf(Invalid);
    expect(await readHeads(db, 'works', ctx.scope)).toEqual([]);
  });

  it('queues extraction for notes not yet extracted and tracks review and cost', async () => {
    expect(await importStatus(db, ctx)).toEqual({ workKey: null, notes: [], costMicros: 0 });
    const { documents } = await importNotes(db, ctx, [
      { name: 'One.md', text: 'Alpha.' },
      { name: 'Two.md', text: 'Beta.' },
    ]);
    const [one, two] = documents.map((d) => d.key);

    await expect(extractImportedNotes(db, ctx)).rejects.toBeInstanceOf(Invalid); // no key yet
    const owner = (await users.findById(db, ctx.userId))!;
    await saveAiKey(db, owner, { provider: 'anthropic', key: 'sk-ant-test-ABCD' }, SECRET);
    expect(await extractImportedNotes(db, ctx)).toEqual({ queued: 2 });
    expect((await importStatus(db, ctx)).notes.map((n) => n.state)).toEqual([
      'extracting',
      'extracting',
    ]);

    // A worker finishes the first run with one proposed change and fails the second.
    const claim = () =>
      jobs.claimNext(db, { workerId: 'w', now: new Date(), lockMs: 60_000, maxAttempts: 3 });
    const j1 = (await claim())!;
    const j2 = (await claim())!;
    const change: ProposalDoc['changes'][number] = {
      op: 'addAlias',
      payload: { entity: 'e1', alias: 'A' },
      confidence: 1,
      matchCandidates: [],
      status: 'pending',
    };
    const p = await saveProposal(db, ctx, {
      jobId: j1._id,
      source: await extractionSource(db, ctx, { documentKey: String(j1.input.documentKey) }),
      changes: [change],
      model: 'mock',
      usage: { tokensIn: 1, tokensOut: 1, costMicros: 1200 },
    });
    await jobs.complete(db, j1._id, 'w', { costKnown: true }, 1200);
    await jobs.fail(db, j2._id, 'w', 'Model said no', null);

    const status = await importStatus(db, ctx);
    const byKey = new Map(status.notes.map((n) => [n.documentKey, n]));
    const done = byKey.get(String(j1.input.documentKey))!;
    const failed = byKey.get(String(j2.input.documentKey))!;
    expect(done).toMatchObject({ state: 'review', pending: 1, proposalId: p._id.toHexString() });
    expect(failed).toMatchObject({ state: 'failed', error: 'Model said no', proposalId: null });
    expect(status.costMicros).toBe(1200);
    expect([one, two]).toContain(done.documentKey);

    // Only the failed note is queued again.
    expect(await extractImportedNotes(db, ctx)).toEqual({ queued: 1 });
  });
});
