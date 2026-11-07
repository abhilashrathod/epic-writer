import { describe, expect, it } from 'vitest';
import { END_OF_TIME, type AsOf } from '@epic/core/asof';
import type { EntityDto, EntityTypeDto, LinkDto, LinkTypeDto, WorldDto } from '@epic/schemas/api';
import {
  buildGraph,
  familyTree,
  lifeOf,
  lineage,
  relationshipWeb,
  treeOptions,
  type GraphContext,
} from './graph';

const type = (key: string, traits: EntityTypeDto['traits'], fields: EntityTypeDto['fields'] = []) =>
  ({
    key,
    name: key,
    pluralName: key,
    icon: 'circle',
    color: 'cat-1',
    group: 'g',
    parentTypeKey: null,
    traits,
    fields,
    order: 0,
  }) as EntityTypeDto;

const date = (key: string) => ({
  key,
  label: key,
  kind: 'date' as const,
  options: [],
  required: false,
  timeVarying: false,
  refTypeKeys: [],
});
const person = type('person', ['born'], [date('born'), date('died')]);
const house = type('house', ['institution']);
const at = (day: number) => ({ start: day, end: null, precision: 'day' as const });

const entity = (
  key: string,
  typeKey: string,
  fields: Record<string, unknown> = {},
  canonState: EntityDto['canonState'] = 'canon',
) =>
  ({
    key,
    typeKey,
    name: key,
    aliases: [],
    summary: '',
    prominence: 'minor',
    canonState,
    tags: [],
    fields,
    images: [],
    slug: key,
    updatedAt: '',
  }) as EntityDto;

const linkTypes: LinkTypeDto[] = [
  {
    key: 'parent',
    label: 'parent of',
    inverseLabel: 'child of',
    kind: 'kinship',
    symmetric: false,
    fromTypeKeys: [],
    toTypeKeys: [],
  },
  {
    key: 'spouse',
    label: 'spouse of',
    inverseLabel: 'spouse of',
    kind: 'kinship',
    symmetric: true,
    fromTypeKeys: [],
    toTypeKeys: [],
  },
  {
    key: 'member',
    label: 'member of',
    inverseLabel: 'has member',
    kind: 'membership',
    symmetric: false,
    fromTypeKeys: [],
    toTypeKeys: [],
  },
  {
    key: 'ally',
    label: 'ally of',
    inverseLabel: 'ally of',
    kind: 'relation',
    symmetric: true,
    fromTypeKeys: [],
    toTypeKeys: [],
  },
];

const link = (
  key: string,
  typeKey: string,
  fromKey: string,
  toKey: string,
  extra: Partial<LinkDto> = {},
): LinkDto => ({
  key,
  typeKey,
  kind: linkTypes.find((t) => t.key === typeKey)!.kind,
  fromKey,
  toKey,
  storyTime: null,
  narrativeRefs: [],
  canonState: 'canon',
  note: '',
  ...extra,
});

// Shantanu + Ganga -> Bhishma; Pandu -> Karna is a secret revealed at order 0005 of work W.
const world: WorldDto = {
  entities: [
    entity('shantanu', 'person', { born: at(0), died: at(500) }),
    entity('ganga', 'person'),
    entity('bhishma', 'person', { born: at(100) }),
    entity('pandu', 'person'),
    entity('karna', 'person'),
    entity('kuru', 'house'),
    entity('ghost', 'person', {}, 'scrapped'),
  ],
  links: [
    link('l1', 'parent', 'shantanu', 'bhishma'),
    link('l2', 'spouse', 'shantanu', 'ganga'),
    link('l3', 'parent', 'pandu', 'karna', {
      narrativeRefs: [{ workKey: 'W', documentKey: 'd', sceneKey: 's', order: '0005' }],
    }),
    link('m1', 'member', 'shantanu', 'kuru'),
    link('m2', 'member', 'bhishma', 'kuru'),
    link('a1', 'ally', 'bhishma', 'karna'),
    link('g1', 'ally', 'ghost', 'karna'),
    link('x1', 'ally', 'pandu', 'ganga', { canonState: 'scrapped' }),
  ],
  facts: [],
};

const ctx = (asOf: AsOf = END_OF_TIME): GraphContext => ({
  world,
  types: [person, house],
  linkTypes,
  asOf,
});
const keys = (xs: { key: string }[]) => xs.map((x) => x.key).sort();
const early: AsOf = { storyTime: 50, workKey: 'W', order: '0001' };

describe('lifeOf', () => {
  it('reads birth and death from the type life fields', () => {
    const [shantanu, , bhishma] = world.entities;
    expect(lifeOf(bhishma!, person, [], early)).toBe('unborn');
    expect(lifeOf(bhishma!, person, [], END_OF_TIME)).toBe('alive');
    expect(lifeOf(shantanu!, person, [], END_OF_TIME)).toBe('dead');
    expect(lifeOf(shantanu!, house, [], END_OF_TIME)).toBe('alive');
  });

  it('applies a death fact once it has happened', () => {
    const ganga = world.entities[1]!;
    const fact = {
      key: 'f',
      entityKey: 'ganga',
      field: 'died',
      value: at(300),
      storyTime: at(300),
      narrativeRefs: [],
      causeKey: null,
      canonState: 'canon' as const,
    };
    expect(lifeOf(ganga, person, [fact], { ...early, storyTime: 400 })).toBe('dead');
    expect(lifeOf(ganga, person, [fact], { ...early, storyTime: 200 })).toBe('alive');
  });
});

describe('buildGraph', () => {
  it('drops scrapped entries and links and marks unrevealed links future', () => {
    const g = buildGraph(ctx(early));
    expect(keys(g.nodes)).not.toContain('ghost');
    expect(keys(g.edges)).toEqual(['a1', 'l1', 'l2', 'l3', 'm1', 'm2']);
    expect(g.edges.find((e) => e.key === 'l3')!.future).toBe(true);
    expect(g.edges.find((e) => e.key === 'l1')).toMatchObject({
      label: 'parent of',
      future: false,
      symmetric: false,
    });
    expect(g.edges.find((e) => e.key === 'l2')!.symmetric).toBe(true);
    expect(g.nodes.find((n) => n.key === 'bhishma')!.life).toBe('unborn');
  });
});

describe('treeOptions and familyTree', () => {
  it('lists institutions with members', () => {
    expect(treeOptions([person, house], buildGraph(ctx()))).toEqual([
      { key: 'kuru', name: 'kuru' },
    ]);
  });

  it('shows members and their family links only', () => {
    const t = familyTree(buildGraph(ctx()), 'kuru');
    expect(keys(t.nodes)).toEqual(['bhishma', 'shantanu']);
    expect(keys(t.edges)).toEqual(['l1']);
  });

  it('with no institution shows everyone with family links, hiding secret parentage until revealed', () => {
    expect(keys(familyTree(buildGraph(ctx(early)), null).nodes)).toEqual([
      'bhishma',
      'ganga',
      'shantanu',
    ]);
    const revealed = familyTree(buildGraph(ctx({ ...early, order: '0005' })), null);
    expect(keys(revealed.nodes)).toEqual(['bhishma', 'ganga', 'karna', 'pandu', 'shantanu']);
    expect(keys(revealed.edges)).toEqual(['l1', 'l2', 'l3']);
  });
});

describe('relationshipWeb', () => {
  it('filters by entry type and link kind', () => {
    const g = buildGraph(ctx());
    const people = relationshipWeb(g, new Set(['person']), new Set(['relation', 'membership']));
    expect(keys(people.nodes)).not.toContain('kuru');
    expect(keys(people.edges)).toEqual(['a1']);
    expect(
      keys(relationshipWeb(g, new Set(['person', 'house']), new Set(['membership'])).edges),
    ).toEqual(['m1', 'm2']);
  });
});

describe('lineage', () => {
  it('expands N hops in both directions', () => {
    const g = buildGraph(ctx());
    expect(keys(lineage(g, 'karna', 0).nodes)).toEqual(['karna']);
    expect(keys(lineage(g, 'karna', 1).nodes)).toEqual(['bhishma', 'karna', 'pandu']);
    expect(keys(lineage(g, 'karna', 2).nodes)).toEqual([
      'bhishma',
      'karna',
      'kuru',
      'pandu',
      'shantanu',
    ]);
    expect(keys(lineage(g, 'karna', 3).nodes)).toHaveLength(6);
    expect(lineage(g, 'ghost', 2).nodes).toEqual([]);
  });
});
