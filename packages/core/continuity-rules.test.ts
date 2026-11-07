import { describe, expect, it } from 'vitest';
import {
  changedSpan,
  checkContinuityRules,
  holderField,
  isDead,
  locateQuote,
  readableText,
  shiftRange,
  type RuleDocument,
  type RuleEntity,
  type RuleFact,
  type RuleType,
  type RuleWorld,
} from './continuity-rules';

const st = (start: number) => ({ start, end: null, precision: 'day' as const });
const field = (key: string, kind: string, extra: Partial<RuleType['fields'][number]> = {}) => ({
  key,
  kind,
  timeVarying: false,
  options: [],
  ...extra,
});
const person: RuleType = {
  key: 'person',
  name: 'Person',
  traits: ['born'],
  fields: [
    field('born', 'date'),
    field('died', 'date'),
    field('status', 'enum', { timeVarying: true, options: ['alive', 'dead'] }),
  ],
};
const weapon: RuleType = {
  key: 'weapon',
  name: 'Weapon',
  traits: ['holdable'],
  fields: [field('holderKey', 'entityRef', { timeVarying: true })],
};
const place: RuleType = { key: 'place', name: 'Place', traits: [], fields: [] };
const entity = (
  key: string,
  typeKey: string,
  fields: Record<string, unknown> = {},
  more: Partial<RuleEntity> = {},
): RuleEntity => ({
  key,
  typeKey,
  name: key[0]!.toUpperCase() + key.slice(1),
  fields,
  canonState: 'canon',
  firstAppearances: [],
  ...more,
});
const fact = (
  entityKey: string,
  f: string,
  value: unknown,
  start: number,
  more: Partial<RuleFact> = {},
): RuleFact => ({
  key: `${entityKey}-${f}-${start}`,
  entityKey,
  field: f,
  value,
  storyTime: st(start),
  narrativeRefs: [],
  canonState: 'canon',
  ...more,
});
const world = (entities: RuleEntity[], facts: RuleFact[] = []): RuleWorld => ({
  types: [person, weapon, place],
  entities,
  facts,
});
const doc = (lines: string[], more: Partial<RuleDocument> = {}): RuleDocument => ({
  text: lines.join('\n'),
  format: 'fountain',
  workKey: 'w1',
  orderPath: '0001.0002',
  storyTime: 100,
  ...more,
});
const m = (key: string, name = key[0]!.toUpperCase() + key.slice(1)) => `[[@e:${key}|${name}]]`;
const scene = (key: string, heading = 'INT. HALL - DAY') => `${heading} [[@s:${key}]]`;

describe('checkContinuityRules: dead-character-acts', () => {
  const dead = entity('bhishma', 'person', { died: st(50) });

  it('flags a dead character who speaks, with the cue as the range', () => {
    const d = doc([scene('s1'), '', m('bhishma', 'BHISHMA'), 'I still stand.']);
    const issues = checkContinuityRules(d, world([dead]));
    expect(issues).toHaveLength(1);
    const [i] = issues;
    expect(i).toMatchObject({
      rule: 'dead-character-acts',
      severity: 'error',
      sceneKey: 's1',
      relatedKeys: ['bhishma'],
    });
    expect(d.text.slice(i!.range.from, i!.range.to)).toBe(m('bhishma', 'BHISHMA'));
    expect(i!.message).toMatch(/Bhishma speaks here, but is dead/);
  });

  it('flags acting as a warning, only when the mention is the subject', () => {
    const acts = doc([scene('s1'), '', `${m('bhishma')} draws his bow.`]);
    expect(checkContinuityRules(acts, world([dead]))[0]).toMatchObject({ severity: 'warning' });
    const named = doc([
      scene('s1'),
      '',
      `They mourn ${m('bhishma')}. ${m('bhishma')}'s pyre burns.`,
    ]);
    expect(checkContinuityRules(named, world([dead]))).toEqual([]);
  });

  it('uses a status fact set to dead, and only once it has happened', () => {
    const alive = entity('karna', 'person');
    const facts = [fact('karna', 'status', 'dead', 80)];
    const d = doc([scene('s1'), '', m('karna', 'KARNA'), 'Hm.']);
    expect(checkContinuityRules(d, world([alive], facts))).toHaveLength(1);
    expect(checkContinuityRules({ ...d, storyTime: 70 }, world([alive], facts))).toEqual([]);
  });

  it('ignores scrapped facts and entries, and skips undated documents', () => {
    const d = doc([scene('s1'), '', m('karna', 'KARNA'), 'Hm.']);
    const scrappedFact = [fact('karna', 'status', 'dead', 80, { canonState: 'scrapped' })];
    expect(checkContinuityRules(d, world([entity('karna', 'person')], scrappedFact))).toEqual([]);
    const scrapped = entity('bhishma', 'person', { died: st(50) }, { canonState: 'scrapped' });
    const cue = doc([scene('s1'), '', m('bhishma', 'BHISHMA'), 'Hm.']);
    expect(checkContinuityRules(cue, world([scrapped]))).toEqual([]);
    expect(checkContinuityRules({ ...cue, storyTime: null }, world([dead]))).toEqual([]);
  });

  it('reports one issue per scene, and uses scene story times over the document’s', () => {
    const d = doc(
      [
        scene('s1'),
        '',
        m('bhishma', 'BHISHMA'),
        'One.',
        '',
        m('bhishma', 'BHISHMA'),
        'Two.',
        '',
        scene('s2'),
        '',
        m('bhishma', 'BHISHMA'),
        'Three.',
      ],
      { sceneTimes: { s2: 10 } },
    );
    const issues = checkContinuityRules(d, world([dead]));
    expect(issues.map((i) => i.sceneKey)).toEqual(['s1']);
  });

  it('checks prose sentence subjects too', () => {
    const d = doc([`The hall is quiet. ${m('bhishma')} rises from the bed.`], {
      format: 'markdown',
    });
    expect(checkContinuityRules(d, world([dead]))[0]).toMatchObject({
      severity: 'warning',
      sceneKey: null,
    });
  });
});

describe('checkContinuityRules: timeline-clash (unborn)', () => {
  const child = entity('abhimanyu', 'person', { born: st(500) });
  it('flags an unborn entry that speaks as an error and a plain mention as info', () => {
    const d = doc([
      scene('s1'),
      '',
      m('abhimanyu', 'ABHIMANYU'),
      'Father!',
      '',
      scene('s2'),
      '',
      `A prophecy names ${m('abhimanyu')}.`,
    ]);
    const issues = checkContinuityRules(d, world([child]));
    expect(issues.map((i) => [i.rule, i.severity, i.sceneKey])).toEqual([
      ['timeline-clash', 'error', 's1'],
      ['timeline-clash', 'info', 's2'],
    ]);
  });
  it('passes once born', () => {
    const d = doc([scene('s1'), '', m('abhimanyu', 'ABHIMANYU'), 'Father!'], { storyTime: 600 });
    expect(checkContinuityRules(d, world([child]))).toEqual([]);
  });
});

describe('checkContinuityRules: item-not-held', () => {
  const arjuna = entity('arjuna', 'person');
  const karna = entity('karna', 'person');
  const bow = entity('gandiva', 'weapon', { holderKey: 'arjuna' });
  const w = world([arjuna, karna, bow], [fact('gandiva', 'holderKey', 'karna', 200)]);

  it('flags an action sentence where someone else uses the item', () => {
    const d = doc([scene('s1'), '', `${m('karna')} lifts ${m('gandiva')} and aims.`]);
    const [i] = checkContinuityRules(d, w);
    expect(i).toMatchObject({
      rule: 'item-not-held',
      severity: 'warning',
      relatedKeys: ['gandiva', 'karna', 'arjuna'],
    });
    expect(d.text.slice(i!.range.from, i!.range.to)).toBe(m('gandiva'));
  });

  it('passes for the holder, uses the holder as of the scene, and only looks in the same sentence', () => {
    expect(
      checkContinuityRules(doc([scene('s1'), '', `${m('arjuna')} lifts ${m('gandiva')}.`]), w),
    ).toEqual([]);
    expect(
      checkContinuityRules(
        doc([scene('s1'), '', `${m('karna')} lifts ${m('gandiva')}.`], { storyTime: 250 }),
        w,
      ),
    ).toEqual([]);
    expect(
      checkContinuityRules(
        doc([scene('s1'), '', `${m('karna')} waits. The ${m('gandiva')} gleams.`]),
        w,
      ),
    ).toEqual([]);
  });

  it('flags dialogue naming the item as info, from the cue’s speaker', () => {
    const d = doc([scene('s1'), '', m('karna', 'KARNA'), `I draw ${m('gandiva')}!`]);
    expect(checkContinuityRules(d, w)[0]).toMatchObject({
      rule: 'item-not-held',
      severity: 'info',
    });
  });

  it('skips items with no holder', () => {
    const free = world([karna, entity('gandiva', 'weapon')]);
    expect(
      checkContinuityRules(doc([scene('s1'), '', `${m('karna')} lifts ${m('gandiva')}.`]), free),
    ).toEqual([]);
  });
});

describe('checkContinuityRules: knowledge-leak (name used too early)', () => {
  const later = entity(
    'shikhandi',
    'place',
    {},
    { firstAppearances: [{ workKey: 'w1', order: '0001.0003.0001' }] },
  );
  it('flags a mention before the first appearance in this work only', () => {
    const d = doc([scene('s1'), '', `They speak of ${m('shikhandi')}.`]);
    expect(checkContinuityRules(d, world([later]))[0]).toMatchObject({
      rule: 'knowledge-leak',
      severity: 'warning',
    });
    expect(checkContinuityRules({ ...d, orderPath: '0001.0003' }, world([later]))).toEqual([]);
    expect(checkContinuityRules({ ...d, workKey: 'w2' }, world([later]))).toEqual([]);
  });
});

describe('helpers', () => {
  it('holderField prefers holderKey, else the first time-varying reference', () => {
    expect(holderField(weapon)).toBe('holderKey');
    expect(
      holderField({
        ...weapon,
        fields: [field('owner', 'entityRef'), field('bearer', 'entityRef', { timeVarying: true })],
      }),
    ).toBe('bearer');
    expect(holderField(place)).toBeNull();
  });

  it('isDead reads death dates and "dead" enum values', () => {
    expect(isDead(person, { died: st(5) }, 10)).toBe(true);
    expect(isDead(person, { died: st(15) }, 10)).toBe(false);
    expect(isDead(person, { status: 'dead' }, 10)).toBe(true);
    expect(isDead(place, { status: 'dead' }, 10)).toBe(false);
  });

  it('readableText and locateQuote map reader quotes back to stored ranges', () => {
    const text = `INT. HALL [[@s:s1]]\n\n${m('karna')} speaks [[a note]] softly.`;
    const r = readableText(text);
    expect(r.display).toBe('INT. HALL \n\nKarna speaks  softly.');
    const at = locateQuote(r, 'Karna speaks');
    expect(text.slice(at!.from, at!.to)).toBe(`${m('karna')} speaks`);
    expect(text.slice(...(Object.values(locateQuote(r, ' softly.')!) as [number, number]))).toBe(
      'softly.',
    );
    expect(locateQuote(r, 'Arjuna')).toBeNull();
    expect(locateQuote(r, '  ')).toBeNull();
  });

  it('changedSpan finds the single edited span', () => {
    expect(changedSpan('abc', 'abc')).toBeNull();
    expect(changedSpan('hello world', 'hello brave world')).toEqual({
      from: 6,
      oldTo: 6,
      newTo: 12,
    });
    expect(changedSpan('abcdef', 'abXef')).toEqual({ from: 2, oldTo: 4, newTo: 3 });
  });

  it('shiftRange keeps ranges before, shifts ranges after and stales touched ones', () => {
    const r = { from: 10, to: 15 };
    expect(shiftRange(r, { from: 20, oldTo: 22, newTo: 25 })).toEqual(r);
    expect(shiftRange(r, { from: 15, oldTo: 15, newTo: 18 })).toEqual(r);
    expect(shiftRange(r, { from: 2, oldTo: 4, newTo: 7 })).toEqual({ from: 13, to: 18 });
    expect(shiftRange(r, { from: 10, oldTo: 10, newTo: 12 })).toEqual({ from: 12, to: 17 });
    expect(shiftRange(r, { from: 12, oldTo: 13, newTo: 13 })).toBeNull();
    expect(shiftRange(r, { from: 5, oldTo: 11, newTo: 6 })).toBeNull();
  });
});
