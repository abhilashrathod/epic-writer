import { describe, expect, it } from 'vitest';
import { END_OF_TIME, type AsOf } from '@epic/core/asof';
import type { EntityDto, EntityTypeDto, FactDto, LinkDto, WorldDto } from '@epic/schemas/api';
import { fieldSegments, historyOf, holdersOver, membersOf } from './institution';

const field = (key: string, kind: string, extra: object = {}) => ({
  key,
  label: key[0]!.toUpperCase() + key.slice(1),
  kind,
  options: [],
  required: false,
  timeVarying: false,
  refTypeKeys: [],
  ...extra,
});
const type = (key: string, traits: string[], fields: object[] = []) =>
  ({ key, name: key, traits, fields }) as unknown as EntityTypeDto;
const types = [
  type('person', ['born'], [field('born', 'date'), field('died', 'date')]),
  type('house', ['institution']),
  type(
    'realm',
    ['geo'],
    [
      field('ruler', 'entityRef', { timeVarying: true, refTypeKeys: ['person'] }),
      field('dynasty', 'entityRef', { timeVarying: true, refTypeKeys: ['house'] }),
    ],
  ),
  type('event', ['event'], [field('when', 'date'), field('who', 'entityRefList')]),
];
const at = (start: number) => ({ start, end: null, precision: 'day' as const });
const entity = (key: string, typeKey: string, fields: Record<string, unknown> = {}) =>
  ({ key, typeKey, name: key, fields, canonState: 'canon' }) as unknown as EntityDto;
const fact = (entityKey: string, f: string, value: unknown, start: number) =>
  ({
    key: `${entityKey}-${f}-${start}`,
    entityKey,
    field: f,
    value,
    storyTime: at(start),
    narrativeRefs: [],
    causeKey: null,
    canonState: 'canon',
  }) as FactDto;
const member = (from: string, to: string) =>
  ({
    key: `${from}-${to}`,
    fromKey: from,
    toKey: to,
    kind: 'membership',
    storyTime: null,
    narrativeRefs: [],
    canonState: 'canon',
  }) as unknown as LinkDto;

// Kuru rules the realm from day 100 to 300; Shantanu then Bhishma's brother sit the throne.
const world: WorldDto = {
  entities: [
    entity('kuru', 'house'),
    entity('pandya', 'house'),
    entity('shantanu', 'person', { born: at(10), died: at(250) }),
    entity('vichitra', 'person', { born: at(200) }),
    entity('outsider', 'person'),
    entity('realm', 'realm', { ruler: 'outsider', dynasty: 'pandya' }),
    entity('vow', 'event', { when: at(120), who: ['shantanu'] }),
  ],
  links: [member('shantanu', 'kuru'), member('vichitra', 'kuru')],
  facts: [
    fact('realm', 'dynasty', 'kuru', 100),
    fact('realm', 'ruler', 'shantanu', 100),
    fact('realm', 'ruler', 'vichitra', 250),
    fact('realm', 'dynasty', 'pandya', 300),
    fact('realm', 'ruler', 'outsider', 300),
  ],
};
const asOf = (storyTime: number | null): AsOf => ({ ...END_OF_TIME, storyTime });

describe('institution views', () => {
  it('lists a field over time from its starting value', () => {
    expect(fieldSegments(world.entities[5]!, world.facts, 'ruler', asOf(260))).toEqual([
      { from: null, value: 'outsider' },
      { from: 100, value: 'shantanu' },
      { from: 250, value: 'vichitra' },
    ]);
  });

  it('finds throne holders while the dynasty held the seat (CX-8)', () => {
    expect(holdersOver(world, types, 'kuru', asOf(null))).toEqual([
      { seatKey: 'realm', holderKey: 'shantanu', from: 100, to: 250 },
      { seatKey: 'realm', holderKey: 'vichitra', from: 250, to: 300 },
    ]);
    // Before day 250 the second holder hasn't happened yet.
    expect(holdersOver(world, types, 'kuru', asOf(200))).toEqual([
      { seatKey: 'realm', holderKey: 'shantanu', from: 100, to: null },
    ]);
    expect(holdersOver(world, types, 'missing', asOf(null))).toEqual([]);
  });

  it('builds a history of members, events and changes that name the dynasty', () => {
    expect(membersOf(world, 'kuru', asOf(null))).toEqual(['shantanu', 'vichitra']);
    expect(historyOf(world, types, 'kuru', asOf(null)).map((i) => [i.start, i.label])).toEqual([
      [10, 'shantanu is born'],
      [100, 'realm: dynasty becomes kuru'],
      [120, 'vow'],
      [200, 'vichitra is born'],
      [250, 'shantanu dies'],
    ]);
    expect(historyOf(world, types, 'kuru', asOf(110))).toHaveLength(2);
  });
});
