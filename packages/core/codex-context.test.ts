import { describe, expect, it } from 'vitest';
import { END_OF_TIME, type AsOf } from './asof';
import {
  buildCodexContext,
  mentions,
  type CodexContextInput,
  type ContextEntity,
} from './codex-context';

const cal = {
  months: Array.from({ length: 12 }, (_, i) => ({ name: `M${i + 1}`, days: 30 })),
  eras: [{ name: 'Age', abbr: 'AG', startDay: 0, direction: 1 as const }],
  displayFormat: '{d} {month} {y} {era}',
};
const day = (start: number) => ({ start, end: null, precision: 'day' as const });

const entity = (key: string, name: string, extra: Partial<ContextEntity> = {}): ContextEntity => ({
  key,
  typeKey: 'person',
  name,
  aliases: [],
  summary: '',
  prominence: 'minor',
  canonState: 'canon',
  fields: {},
  ...extra,
});

const world = (): CodexContextInput => ({
  calendar: cal,
  types: [
    {
      key: 'person',
      name: 'Person',
      traits: ['born'],
      fields: [
        { key: 'title', label: 'Title', kind: 'text' },
        { key: 'born', label: 'Born', kind: 'date' },
        { key: 'died', label: 'Died', kind: 'date' },
        { key: 'home', label: 'Home', kind: 'entityRef' },
      ],
    },
    { key: 'place', name: 'Place', traits: [], fields: [] },
  ],
  linkTypes: [{ key: 'parent', label: 'parent of', inverseLabel: 'child of', symmetric: false }],
  entities: [
    entity('a', 'Asha', {
      prominence: 'main',
      aliases: ['The Archer'],
      summary: 'A prince.',
      fields: { title: 'Prince', born: day(0), died: day(3600), home: 'p' },
    }),
    entity('b', 'Bhanu', { fields: { born: day(1000) } }),
    entity('p', 'Riverhold', { typeKey: 'place', prominence: 'supporting' }),
    entity('x', 'Ghost', { canonState: 'scrapped', prominence: 'main' }),
  ],
  links: [
    {
      typeKey: 'parent',
      fromKey: 'a',
      toKey: 'b',
      note: '',
      canonState: 'canon',
      storyTime: null,
      narrativeRefs: [{ workKey: 'w', order: '0001.0002' }],
    },
    {
      typeKey: 'parent',
      fromKey: 'x',
      toKey: 'a',
      note: '',
      canonState: 'canon',
      storyTime: null,
      narrativeRefs: [],
    },
  ],
  facts: [
    {
      key: 'f1',
      entityKey: 'a',
      field: 'title',
      value: 'King',
      canonState: 'canon',
      storyTime: day(2000),
      narrativeRefs: [],
    },
    {
      key: 'f2',
      entityKey: 'a',
      field: 'title',
      value: 'Exile',
      canonState: 'scrapped',
      storyTime: day(1500),
      narrativeRefs: [],
    },
  ],
});

const at = (storyTime: number | null, order: string | null = null): AsOf => ({
  storyTime,
  workKey: order ? 'w' : null,
  order,
});
const textOf = (asOf: AsOf, q = '') =>
  buildCodexContext(world(), asOf, q)
    .map((c) => c.text)
    .join('\n\n');

describe('mentions', () => {
  it('matches whole words, ignoring case', () => {
    expect(mentions('Who is asha?', 'Asha')).toBe(true);
    expect(mentions('Ashani rode out', 'Asha')).toBe(false);
    expect(mentions('anything', ' ')).toBe(false);
  });
});

describe('buildCodexContext', () => {
  it('resolves fields as of the point and never includes scrapped data', () => {
    expect(textOf(at(1800))).toContain('Title: Prince');
    expect(textOf(at(1800))).not.toContain('Exile');
    expect(textOf(at(2500))).toContain('Title: King');
    expect(textOf(END_OF_TIME)).not.toContain('Ghost');
  });

  describe('card budget', () => {
    const backstory = 'Raised in exile by the river. '.repeat(40).trim();
    const withFields = () => {
      const input = world();
      input.types[0]!.fields.push(
        { key: 'backstory', label: 'Backstory', kind: 'richtext', ai: 'read' },
        { key: 'notes', label: 'Notes', kind: 'richtext', ai: 'hidden' },
        { key: 'mood', label: 'Mood', kind: 'text', ai: 'extract', timeVarying: true },
      );
      input.entities[0]!.fields = {
        ...input.entities[0]!.fields,
        backstory,
        notes: 'Rewrite this arc',
        mood: 'grim',
      };
      return input;
    };
    const text = (relevantFields: string[], question = '') =>
      buildCodexContext(withFields(), END_OF_TIME, question, { relevantFields })
        .map((c) => c.text)
        .join(' ');

    it('never includes a hidden field, not even by name', () => {
      expect(text(['a#notes'], 'Asha')).not.toMatch(/Rewrite this arc|Notes/);
    });

    it('includes a relevant long field in full, without clipping', () => {
      expect(text(['a#backstory'])).toContain(`Backstory: ${backstory}`);
    });

    it('shows a short long-text field, which has no chunk to be ranked by', () => {
      const input = withFields();
      input.entities[0]!.fields.backstory = 'Born by the river.';
      const out = buildCodexContext(input, END_OF_TIME, '').map((x) => x.text);
      expect(out.join(' ')).toContain('Backstory: Born by the river.');
    });

    it('omits an irrelevant long field and says it exists', () => {
      const out = text([]);
      expect(out).not.toContain('Raised in exile');
      expect(out).toContain('Also on file, not shown: Backstory');
    });

    it('leaves planned outcomes out only when asked to', () => {
      const input = withFields();
      input.types[0]!.fields.push({ key: 'fate', label: 'Fate', kind: 'text', ai: 'read' });
      input.entities[0]!.fields.fate = 'Falls at the ford';
      const run = (excludePlanned: boolean) =>
        buildCodexContext(input, END_OF_TIME, '', { excludePlanned })
          .map((x) => x.text)
          .join(' ');
      expect(run(false)).toContain('Fate: Falls at the ford');
      expect(run(true)).not.toMatch(/Fate|Falls at the ford/);
    });

    it('hides arcs and turning points by default but keeps the truth of a secret', () => {
      const input = withFields();
      input.types[0]!.fields.push(
        { key: 'arcSummary', label: 'Arc summary', kind: 'text', ai: 'read' },
        { key: 'turningPoints', label: 'Turning points', kind: 'list', ai: 'read' },
        { key: 'theTruth', label: 'The truth', kind: 'text', ai: 'read' },
      );
      Object.assign(input.entities[0]!.fields, {
        arcSummary: 'Rises then falls',
        turningPoints: ['The oath'],
        theTruth: 'Secretly a prince',
      });
      const out = buildCodexContext(input, END_OF_TIME, '', { excludePlanned: true })
        .map((x) => x.text)
        .join(' ');
      expect(out).not.toMatch(/Rises then falls|The oath|Arc summary|Turning points/);
      expect(out).toContain('The truth: Secretly a prince');
    });

    it('filters narrative-reference items but leaves other lists alone', () => {
      const input = withFields();
      input.types[0]!.fields.push(
        { key: 'paidOffAt', label: 'Paid off at', kind: 'list', ai: 'read' },
        { key: 'skills', label: 'Skills', kind: 'list', ai: 'read' },
      );
      Object.assign(input.entities[0]!.fields, {
        paidOffAt: ['Early', 'Late'],
        skills: ['Early', 'Late'],
      });
      const out = buildCodexContext(input, END_OF_TIME, '', {
        keepNarrativeRef: (item) => item === 'Early',
      })
        .map((x) => x.text)
        .join(' ');
      expect(out).toContain('Paid off at: Early');
      expect(out).not.toContain('Paid off at: Early, Late');
      expect(out).toContain('Skills: Early, Late');
    });

    it('always includes the summary and current facts, however small the budget', () => {
      const out = text([]);
      expect(out).toContain('Summary: A prince.');
      expect(out).toContain('Mood: grim');
    });
  });

  it('leaves out facts that have not happened yet', () => {
    const text = textOf(at(1000));
    expect(text).not.toContain('King');
    expect(text).toContain('Title: Prince');
  });

  it('shows life status and age, and hides a death date that is still to come', () => {
    const before = textOf(at(1800));
    expect(before).toContain('Life: alive, age 5');
    expect(before).not.toContain('Died:');
    expect(before).toMatch(/Bhanu \(Person\)\nLife: alive, age 2/);
    expect(textOf(at(500))).toContain('Life: not yet born');
    expect(textOf(at(4000))).toMatch(/Life: dead, age 10[\s\S]*Died:/);
  });

  it('names refs and connections, and hides links not yet revealed in the work', () => {
    const early = textOf(at(null, '0001.0001'));
    expect(early).toContain('Home: Riverhold');
    expect(early).not.toContain('parent of');
    const later = textOf(at(null, '0001.0002'));
    expect(later).toContain('parent of Bhanu [b]');
    expect(later).toContain('child of Asha [a]');
  });

  it('ranks named entries, then their connections, then by prominence', () => {
    expect(buildCodexContext(world(), END_OF_TIME, '').map((c) => c.key)).toEqual(['a', 'p', 'b']);
    expect(
      buildCodexContext(world(), END_OF_TIME, 'Tell me about Bhanu').map((c) => c.key),
    ).toEqual(['b', 'a', 'p']);
    // Aliases count; a link not yet revealed doesn't pull its far end up.
    expect(
      buildCodexContext(world(), at(null, '0001.0001'), 'the archer?').map((c) => c.key),
    ).toEqual(['a', 'p', 'b']);
  });

  it('stays within the card and size budget', () => {
    const big = world();
    big.entities = Array.from({ length: 100 }, (_, i) =>
      entity(`e${i}`, `Name ${i}`, { summary: 'x'.repeat(500) }),
    );
    expect(buildCodexContext(big, END_OF_TIME, '')).toHaveLength(40);
    const cards = buildCodexContext(big, END_OF_TIME, '', { maxChars: 2_000 });
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(2_000);
  });
});
