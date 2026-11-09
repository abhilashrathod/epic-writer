import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId, type Db } from 'mongodb';
import { col, readHeadByKey, readHeads } from '@epic/db';
import { createTestDb } from '@epic/db/testing';
import type { ExtractionOutput } from '@epic/schemas/proposals';
import { createProject } from './create-project';
import { createEntity } from './entities';
import { Invalid } from './errors';
import {
  applyProposal,
  extractionCodex,
  extractionScope,
  MAX_FIELDS_PER_ENTRY,
  extractionSource,
  getProposal,
  listProposals,
  proposalChanges,
  reviewProposal,
  saveProposal,
} from './proposals';
import { saveWorkingText } from './save';
import { createDocument, createWork, openProject, type ProjectContext } from './works';

let db: Db;
let drop: () => Promise<void>;
let ctx: ProjectContext;
let episode: string;
let arjuna: string;

beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());
beforeEach(async () => {
  const userId = new ObjectId();
  const p = await createProject(db, { ownerId: userId, name: 'W', templateKey: 'mythological' });
  ctx = await openProject(db, p._id, userId);
  const workKey = await createWork(db, ctx, { name: 'Series', medium: 'series' });
  const season = await createDocument(db, ctx, { workKey, parentKey: null });
  episode = await createDocument(db, ctx, { workKey, parentKey: season });
  const types = await readHeads(db, 'entityTypes', ctx.scope);
  const character = types.find((t) => t.name === 'Character')!.key;
  arjuna = await createEntity(db, ctx, { typeKey: character, name: 'Arjuna', aliases: ['Partha'] });
  await saveWorkingText(db, ctx, {
    documentKey: episode,
    text: [
      'INT. PALACE - DAY [[@s:s1]]',
      '',
      'Partha, called Dhananjaya, bows to Drona. Kunti watches.',
      '',
      'EXT. FIELD - NIGHT [[@s:s2]]',
      '',
      'Drona dies on the field. Arjun weeps.',
    ].join('\n'),
    baseVersion: 0,
  });
});

const entry = (
  name: string,
  over: Partial<ExtractionOutput['entries'][number]> = {},
): ExtractionOutput['entries'][number] => ({
  name,
  type: 'Character',
  aliases: [],
  summary: '',
  fields: [],
  sameAs: null,
  confidence: 0.95,
  quote: name,
  ...over,
});

async function propose(out: ExtractionOutput, sceneKey?: string) {
  const source = await extractionSource(db, ctx, { documentKey: episode, sceneKey });
  const { changes, warnings } = proposalChanges(out, await extractionCodex(db, ctx), source);
  const p = await saveProposal(db, ctx, {
    jobId: new ObjectId(),
    source,
    changes,
    warnings,
    model: 'mock',
    usage: { tokensIn: 1, tokensOut: 1, costMicros: null },
  });
  return p._id.toHexString();
}

const commitCount = () => col(db, 'commits').countDocuments({ projectId: ctx.project._id });

describe('extraction proposals', () => {
  it('reads one scene or the whole document as the reader sees it', async () => {
    const scene = await extractionSource(db, ctx, { documentKey: episode, sceneKey: 's2' });
    expect(scene.text).toBe('EXT. FIELD - NIGHT\n\nDrona dies on the field. Arjun weeps.');
    expect(scene.range).not.toBeNull();
    expect(scene.scenes).toHaveLength(1);
    const whole = await extractionSource(db, ctx, { documentKey: episode });
    expect(whole.range).toBeNull();
    expect(whole.scenes.map((s) => s.ref.sceneKey)).toEqual(['s1', 's2']);
  });

  it('resolves identities: strong matches become aliases, uncertain ones need a choice', async () => {
    const id = await propose({
      entries: [
        entry('Dhananjaya', { sameAs: 'Partha', aliases: ['Partha'] }),
        entry('Drona'),
        entry('Arjun'),
        entry('Unknown Thing', { type: 'No such type' }),
      ],
      facts: [
        {
          entry: 'Drona',
          field: 'Status',
          value: 'Dead',
          when: null,
          confidence: 0.9,
          quote: 'Drona dies',
        },
      ],
      links: [
        { from: 'Drona', type: 'student of', to: 'Partha', note: '', confidence: 0.7, quote: '' },
      ],
    });
    const p = await getProposal(db, ctx, id);
    expect(p.source.text).toContain('Partha, called Dhananjaya');
    expect(p.changes.map((c) => c.op)).toEqual([
      'addAlias',
      'createEntity',
      'createEntity',
      'addFact',
      'createLink',
    ]);
    const [alias, drona, arjun, fact, link] = p.changes;
    expect(alias!.payload).toMatchObject({ entity: arjuna, alias: 'Dhananjaya' });
    expect(drona!.payload).toMatchObject({ ref: 'new:1', name: 'Drona', needsChoice: false });
    expect(arjun!.payload).toMatchObject({ needsChoice: true });
    expect(arjun!.matchCandidates).toEqual([{ key: arjuna, score: 0.83 }]);
    expect(fact!.payload).toMatchObject({ entity: 'new:1', field: 'status', value: 'dead' });
    expect((fact!.payload.narrativeRefs as { sceneKey: string }[])[0]!.sceneKey).toBe('s2');
    // "student of" is the reverse label: the teacher is the link's start.
    expect(link!.payload).toMatchObject({ from: arjuna, to: 'new:1' });
  });

  it('commits accepted changes as one AI commit, resolving references to new entries', async () => {
    const id = await propose({
      entries: [entry('Drona'), entry('Kunti')],
      facts: [
        {
          entry: 'Drona',
          field: 'status',
          value: 'dead',
          when: null,
          confidence: 0.9,
          quote: 'Drona dies',
        },
      ],
      links: [
        { from: 'Kunti', type: 'parent of', to: 'Partha', note: '', confidence: 0.8, quote: '' },
      ],
    });
    // A fact on a new entry can't be committed without the entry.
    await reviewProposal(db, ctx, id, { changes: [{ index: 2, status: 'accepted' }] });
    await expect(applyProposal(db, ctx, id)).rejects.toThrow(/Accept the new entry "Drona"/);

    const before = await commitCount();
    await reviewProposal(db, ctx, id, {
      changes: [
        { index: 0, status: 'accepted' },
        { index: 3, status: 'accepted' },
        { index: 1, status: 'accepted', payload: { name: 'Kunti Devi' } },
      ],
    });
    const { seq, applied } = await applyProposal(db, ctx, id);
    expect(applied).toBe(4);
    expect(await commitCount()).toBe(before + 1);
    const commit = await col(db, 'commits').findOne({ projectId: ctx.project._id, seq });
    expect(commit).toMatchObject({
      author: { kind: 'ai', userId: ctx.userId, proposalId: new ObjectId(id) },
      stats: { entities: 2, links: 1, facts: 1 },
    });
    const p = await getProposal(db, ctx, id);
    expect(p).toMatchObject({ status: 'applied', appliedSeq: seq });
    const dronaKey = p.changes[0]!.payload.createdKey as string;
    const drona = await readHeadByKey(db, 'entities', ctx.scope, dronaKey);
    expect(drona).toMatchObject({ name: 'Drona', origin: 'ai', proposalId: new ObjectId(id) });
    expect(await readHeads(db, 'facts', ctx.scope, { entityKey: dronaKey })).toHaveLength(1);
    const kunti = p.changes[1]!.payload.createdKey as string;
    expect(await readHeads(db, 'links', ctx.scope, { fromKey: kunti, toKey: arjuna })).toHaveLength(
      1,
    );
    await expect(applyProposal(db, ctx, id)).rejects.toThrow(Invalid);
    await expect(
      reviewProposal(db, ctx, id, { changes: [{ index: 0, status: 'rejected' }] }),
    ).rejects.toThrow(/already in the codex/);
  });

  it('applies part of a proposal, then the rest later; a chosen match adds aliases instead', async () => {
    const id = await propose({
      entries: [entry('Arjun'), entry('Drona')],
      facts: [],
      links: [
        { from: 'Drona', type: 'teacher of', to: 'Arjun', note: '', confidence: 0.8, quote: '' },
      ],
    });
    await expect(
      reviewProposal(db, ctx, id, { changes: [{ index: 0, status: 'accepted' }] }),
    ).rejects.toThrow(/Choose whether "Arjun"/);
    await expect(
      reviewProposal(db, ctx, id, { changes: [{ index: 1, payload: { name: '' } }] }),
    ).rejects.toThrow(Invalid);

    await reviewProposal(db, ctx, id, { changes: [{ index: 1, status: 'accepted' }] });
    await applyProposal(db, ctx, id);
    expect((await listProposals(db, ctx, episode))[0]).toMatchObject({
      id,
      status: 'partially-applied',
      counts: { applied: 1, pending: 2 },
    });

    await reviewProposal(db, ctx, id, {
      changes: [
        { index: 0, status: 'accepted', payload: { useKey: arjuna, needsChoice: false } },
        { index: 2, status: 'accepted' },
      ],
    });
    await applyProposal(db, ctx, id);
    const a = await readHeadByKey(db, 'entities', ctx.scope, arjuna);
    expect(a!.aliases).toEqual(['Partha', 'Arjun']);
    expect(await readHeads(db, 'links', ctx.scope, { toKey: arjuna })).toHaveLength(1);
    expect((await getProposal(db, ctx, id)).status).toBe('applied');
  });

  it('marks a proposal rejected when every change is rejected', async () => {
    const id = await propose({ entries: [entry('Drona')], facts: [], links: [] });
    const p = await reviewProposal(db, ctx, id, { changes: [{ index: 0, status: 'rejected' }] });
    expect(p.status).toBe('rejected');
    await expect(getProposal(db, ctx, new ObjectId().toHexString())).rejects.toThrow(/not found/);
  });

  describe('AI access and evidence', () => {
    const field = (name: string, value: string, confidence = 0.9) => ({
      field: name,
      value,
      confidence,
    });
    const fact = (over: Partial<ExtractionOutput['facts'][number]>) => ({
      entry: 'Partha',
      field: 'status',
      value: 'dead',
      when: null,
      confidence: 0.9,
      quote: 'Drona dies',
      ...over,
    });

    it('proposes only extract fields, whatever the model returns', async () => {
      const p = await getProposal(
        db,
        ctx,
        await propose({
          entries: [
            entry('Partha', {
              fields: [field('Want', 'the throne'), field('Status', 'alive'), field('Where', 'x')],
            }),
          ],
          facts: [],
          links: [],
        }),
      );
      expect(p.changes.map((c) => c.payload.field)).toEqual(['status']);
      expect(p.warnings[0]).toMatch(/Ignored 1 values/);
    });

    it('caps fields per entry by confidence with a warning instead of failing', async () => {
      const fields = Array.from({ length: MAX_FIELDS_PER_ENTRY + 5 }, (_, i) =>
        field(`Field ${i}`, 'x', i / 100),
      );
      fields.push(field('Status', 'dead', 0.01));
      const p = await getProposal(
        db,
        ctx,
        await propose({ entries: [entry('Partha', { fields })], facts: [], links: [] }),
      );
      expect(p.changes.some((c) => c.payload.field === 'status')).toBe(false);
      expect(p.warnings[0]).toMatch(/kept the 60 surest fields and dropped 6/);
    });

    it('marks a quote that is not in the text and zeroes its confidence', async () => {
      const p = await getProposal(
        db,
        ctx,
        await propose({
          entries: [entry('Drona', { quote: 'Drona   dies\non the field' }), entry('Bhima')],
          facts: [],
          links: [],
        }),
      );
      expect(p.changes[0]).toMatchObject({ flags: [], confidence: 0.95 });
      expect(p.changes[1]).toMatchObject({ flags: ['quote-not-found'], confidence: 0 });
    });

    it('keeps a value outside the choices, flags it and blocks acceptance until edited', async () => {
      const id = await propose({
        entries: [entry('Partha', { fields: [field('Status', 'ascended')] })],
        facts: [fact({ value: 'vanished' })],
        links: [],
      });
      const p = await getProposal(db, ctx, id);
      expect(p.changes[0]).toMatchObject({
        op: 'updateField',
        payload: { value: 'ascended' },
        flags: ['value-not-in-choices'],
      });
      expect(p.changes[1]).toMatchObject({ op: 'addFact', payload: { value: 'vanished' } });
      await expect(
        reviewProposal(db, ctx, id, { changes: [{ index: 1, status: 'accepted' }] }),
      ).rejects.toThrow(/isn’t one of this field’s choices/);
      const edited = await reviewProposal(db, ctx, id, {
        changes: [{ index: 1, payload: { value: 'dead' }, status: 'accepted' }],
      });
      expect(edited.changes[1]!.flags).not.toContain('value-not-in-choices');
    });

    it('anchors facts to their scene and stated date, and flags facts with neither', async () => {
      const whole = await extractionSource(db, ctx, { documentKey: episode });
      const codex = await extractionCodex(db, ctx);
      const era = codex.calendar!.eras[1]!.name;
      const { changes } = proposalChanges(
        {
          entries: [],
          facts: [fact({ when: `12 ${era}` }), fact({ quote: 'nowhere in the text' })],
          links: [],
        },
        codex,
        whole,
      );
      expect((changes[0]!.payload.narrativeRefs as { sceneKey: string }[])[0]!.sceneKey).toBe('s2');
      expect(changes[0]!.payload.storyTime).toMatchObject({ precision: 'year' });
      expect(changes[0]!.flags).toBeUndefined();
      expect(changes[1]!.flags).toEqual(['quote-not-found', 'no-anchor']);
    });

    it('scopes pass 2: known names keep their type, others bring their candidates', async () => {
      const codex = await extractionCodex(db, ctx);
      const scope = extractionScope(
        [
          { name: 'Partha', types: ['Astra'] },
          { name: 'Hastinapura', types: ['Kingdom', 'No such type'] },
          { name: 'Zzz', types: ['Nope'] },
        ],
        codex,
        'Partha rides to Hastinapura.',
      );
      expect(scope.types.map((t) => t.name).sort()).toEqual(['Character', 'Kingdom']);
      expect(scope.entries.map((e) => e.name)).toEqual(['Arjuna']);
      expect(scope.unclassified).toEqual(['Zzz']);
    });
  });
});
