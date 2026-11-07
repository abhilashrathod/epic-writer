import { v7 as uuidv7 } from 'uuid';
import type {
  CalendarBody,
  EntityTypeBody,
  FieldDef,
  LinkKind,
  LinkTypeBody,
  Trait,
  Unit,
} from '@epic/db';
import { TEMPLATE_INFO, type TEMPLATE_KEYS } from '@epic/schemas/api';
import type { Change } from './commit';

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

// Templates name types by local ids ('character'); applyTemplate swaps them for fresh keys.
interface TField {
  key: string;
  label: string;
  kind: FieldDef['kind'];
  options?: string[];
  required?: boolean;
  timeVarying?: boolean;
  refs?: string[];
}
interface TType {
  id: string;
  name: string;
  plural: string;
  icon: string;
  color: string;
  group: string;
  parent?: string;
  traits: Trait[];
  fields: TField[];
}
interface TLink {
  label: string;
  inverse: string;
  kind: LinkKind;
  symmetric?: boolean;
  from: string[];
  to: string[];
}
export interface BuiltInTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  groups: string[];
  types: TType[];
  links: TLink[];
  units: Unit[];
  calendar: CalendarBody;
}

/** A calendar with a backward era before the epoch (like BC) and a forward era from it. */
const calendar = (name: string, era: string, abbr: string): CalendarBody => ({
  ...singleEra(name, era, abbr),
  eras: [
    { name: `Before the ${era}`, abbr: `B${abbr}`, startDay: -1_000_000_000, direction: -1 },
    { name: era, abbr, startDay: 0, direction: 1 },
  ],
});

const singleEra = (name: string, era: string, abbr: string): CalendarBody => ({
  name,
  epochOffset: 0,
  months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })),
  daysPerWeek: 7,
  weekdayNames: Array.from({ length: 7 }, (_, i) => `Day ${i + 1}`),
  eras: [{ name: era, abbr, startDay: 0, direction: 1 }],
  displayFormat: '{day} {month}, {year} {era}',
});

// Shared building blocks.
const ROLES = [
  'protagonist',
  'antagonist',
  'mentor',
  'ally',
  'rival',
  'love interest',
  'foil',
  'other',
];
const characterFields = (placeIds: string[]): TField[] => [
  { key: 'title', label: 'Title or epithet', kind: 'text' },
  { key: 'role', label: 'Story role', kind: 'enum', options: ROLES },
  { key: 'want', label: 'Want', kind: 'richtext' },
  { key: 'need', label: 'Need', kind: 'richtext' },
  { key: 'wound', label: 'Wound', kind: 'richtext' },
  { key: 'lie', label: 'Lie they believe', kind: 'richtext' },
  { key: 'voice', label: 'Voice', kind: 'richtext' },
  { key: 'born', label: 'Born', kind: 'date' },
  { key: 'died', label: 'Died', kind: 'date' },
  {
    key: 'status',
    label: 'Status',
    kind: 'enum',
    options: ['alive', 'dead', 'missing', 'unknown'],
    timeVarying: true,
  },
  {
    key: 'locationKey',
    label: 'Where they are',
    kind: 'entityRef',
    refs: placeIds,
    timeVarying: true,
  },
];
const placeFields = (kinds: string[], within: string[]): TField[] => [
  { key: 'kind', label: 'Kind of place', kind: 'enum', options: kinds },
  { key: 'within', label: 'Lies within', kind: 'entityRef', refs: within },
  { key: 'description', label: 'Description', kind: 'richtext' },
];
const eventType = (placeIds: string[], who: string[]): TType => ({
  id: 'event',
  name: 'Event',
  plural: 'Events',
  icon: 'bolt',
  color: 'cat-6',
  group: 'Lore',
  traits: ['event'],
  fields: [
    { key: 'when', label: 'When', kind: 'date' },
    { key: 'where', label: 'Where', kind: 'entityRef', refs: placeIds },
    { key: 'participants', label: 'Who took part', kind: 'entityRefList', refs: who },
    { key: 'outcome', label: 'Outcome', kind: 'richtext' },
  ],
});
const secretType: TType = {
  id: 'secret',
  name: 'Secret',
  plural: 'Secrets',
  icon: 'eye',
  color: 'cat-8',
  group: 'Lore',
  traits: ['secret'],
  fields: [{ key: 'truth', label: 'The truth', kind: 'richtext' }],
};
const kinshipLinks = (person: string, group: string): TLink[] => [
  { label: 'parent of', inverse: 'child of', kind: 'kinship', from: [person], to: [person] },
  {
    label: 'spouse of',
    inverse: 'spouse of',
    kind: 'kinship',
    symmetric: true,
    from: [person],
    to: [person],
  },
  {
    label: 'sibling of',
    inverse: 'sibling of',
    kind: 'kinship',
    symmetric: true,
    from: [person],
    to: [person],
  },
  { label: 'member of', inverse: 'has member', kind: 'membership', from: [person], to: [group] },
  { label: 'teacher of', inverse: 'student of', kind: 'teaching', from: [person], to: [person] },
  {
    label: 'ally of',
    inverse: 'ally of',
    kind: 'relation',
    symmetric: true,
    from: [person, group],
    to: [person, group],
  },
  {
    label: 'enemy of',
    inverse: 'enemy of',
    kind: 'relation',
    symmetric: true,
    from: [person, group],
    to: [person, group],
  },
  { label: 'knows', inverse: 'known by', kind: 'knowledge', from: [person], to: ['secret'] },
  { label: 'caused', inverse: 'caused by', kind: 'causal', from: ['event'], to: ['event'] },
];

/** EP-1: links between places beyond nesting. */
const geoLinks = (places: string[], routes: string[]): TLink[] => [
  {
    label: 'borders',
    inverse: 'borders',
    kind: 'location',
    symmetric: true,
    from: places,
    to: places,
  },
  {
    label: 'flows through',
    inverse: 'has flowing through it',
    kind: 'location',
    from: places,
    to: places,
  },
  {
    label: 'crosses',
    inverse: 'crossed by',
    kind: 'location',
    from: [...routes, ...places],
    to: places,
  },
];

/** EP-5: a rule system (magic, technology, divine power) with who may use it and what counters it. */
const ruleSystemType = (id: string, name: string, plural: string, users: string[]): TType => ({
  id,
  name,
  plural,
  icon: 'gem',
  color: 'cat-6',
  group: 'Lore',
  traits: ['ruleSystem'],
  fields: [
    { key: 'source', label: 'Source', kind: 'richtext' },
    { key: 'cost', label: 'Cost', kind: 'richtext' },
    { key: 'limits', label: 'Limits', kind: 'richtext' },
    {
      key: 'users',
      label: 'Who can use it',
      kind: 'entityRefList',
      refs: users,
      timeVarying: true,
    },
    { key: 'counters', label: 'Countered by', kind: 'entityRefList', refs: [id] },
    { key: 'conditions', label: 'Conditions', kind: 'richtext' },
  ],
});

/** EP-5: one power drawn from a rule system, with charges and conditions; uses are events. */
const abilityFields = (system: string, self: string, holders: string[]): TField[] => [
  { key: 'system', label: 'Rule system', kind: 'entityRef', refs: [system] },
  { key: 'conditions', label: 'Conditions', kind: 'richtext' },
  { key: 'cost', label: 'Cost', kind: 'richtext' },
  { key: 'counters', label: 'Countered by', kind: 'entityRefList', refs: [self] },
  { key: 'charges', label: 'Uses left', kind: 'number', timeVarying: true },
  { key: 'holderKey', label: 'Held by', kind: 'entityRef', refs: holders, timeVarying: true },
];

/** EP-6: weapons and artifacts whose holder and properties change over time. */
const artifactType = (id: string, holders: string[]): TType => ({
  id,
  name: 'Weapon or artifact',
  plural: 'Weapons and artifacts',
  icon: 'sword',
  color: 'cat-5',
  group: 'War',
  traits: ['holdable'],
  fields: [
    { key: 'properties', label: 'Properties', kind: 'richtext', timeVarying: true },
    { key: 'condition', label: 'Condition', kind: 'text', timeVarying: true },
    { key: 'holderKey', label: 'Held by', kind: 'entityRef', refs: holders, timeVarying: true },
  ],
});

const mythological: BuiltInTemplate = {
  key: 'mythological',
  ...TEMPLATE_INFO.mythological,
  groups: ['Civilisation', 'Land', 'War', 'Lore'],
  units: [
    { key: 'km', name: 'Kilometre', abbr: 'km', toBase: 1 },
    { key: 'yojana', name: 'Yojana', abbr: 'yj', toBase: 12 },
    { key: 'krosha', name: 'Krosha', abbr: 'kr', toBase: 3 },
  ],
  calendar: calendar('Age reckoning', 'Age', 'A'),
  types: [
    {
      id: 'character',
      name: 'Character',
      plural: 'Characters',
      icon: 'person',
      color: 'cat-1',
      group: 'Civilisation',
      traits: ['born', 'locatable'],
      fields: characterFields(['place', 'kingdom']),
    },
    {
      id: 'dynasty',
      name: 'Dynasty',
      plural: 'Dynasties',
      icon: 'family',
      color: 'cat-2',
      group: 'Civilisation',
      traits: ['institution'],
      fields: [
        { key: 'founder', label: 'Founder', kind: 'entityRef', refs: ['character'] },
        { key: 'seat', label: 'Seat', kind: 'entityRef', refs: ['place', 'kingdom'] },
        { key: 'lineage', label: 'Lineage', kind: 'text' },
      ],
    },
    {
      id: 'kingdom',
      name: 'Kingdom',
      plural: 'Kingdoms',
      icon: 'crown',
      color: 'cat-3',
      group: 'Land',
      traits: ['geo', 'institution', 'locatable'],
      fields: [
        { key: 'capital', label: 'Capital', kind: 'entityRef', refs: ['place'] },
        { key: 'ruler', label: 'Ruler', kind: 'entityRef', refs: ['character'], timeVarying: true },
        {
          key: 'dynasty',
          label: 'Ruling dynasty',
          kind: 'entityRef',
          refs: ['dynasty'],
          timeVarying: true,
        },
        { key: 'description', label: 'Description', kind: 'richtext' },
      ],
    },
    {
      id: 'place',
      name: 'Place',
      plural: 'Places',
      icon: 'mountain',
      color: 'cat-4',
      group: 'Land',
      traits: ['geo', 'locatable'],
      fields: placeFields(
        [
          'city',
          'region',
          'river',
          'mountain',
          'forest',
          'sea',
          'pass',
          'road',
          'hermitage',
          'other',
        ],
        ['place', 'kingdom'],
      ),
    },
    {
      id: 'astra',
      name: 'Astra',
      plural: 'Astras',
      icon: 'star',
      color: 'cat-5',
      group: 'War',
      traits: ['ability', 'holdable'],
      fields: [
        { key: 'deity', label: 'Granted by', kind: 'entityRef', refs: ['character'] },
        { key: 'invocation', label: 'Invocation', kind: 'richtext' },
        { key: 'effect', label: 'Effect', kind: 'richtext' },
        ...abilityFields('power', 'astra', ['character']),
      ],
    },
    artifactType('weapon', ['character']),
    ruleSystemType('power', 'Power system', 'Power systems', ['character']),
    {
      id: 'army',
      name: 'Army',
      plural: 'Armies',
      icon: 'flag',
      color: 'cat-7',
      group: 'War',
      traits: ['hasStrength', 'locatable'],
      fields: [
        {
          key: 'allegiance',
          label: 'Fights for',
          kind: 'entityRef',
          refs: ['kingdom', 'dynasty'],
          timeVarying: true,
        },
        {
          key: 'commander',
          label: 'Commander',
          kind: 'entityRef',
          refs: ['character'],
          timeVarying: true,
        },
        { key: 'composition', label: 'Composition', kind: 'composition', timeVarying: true },
        { key: 'strength', label: 'Strength', kind: 'number', timeVarying: true },
        {
          key: 'locationKey',
          label: 'Position',
          kind: 'entityRef',
          refs: ['place', 'kingdom'],
          timeVarying: true,
        },
      ],
    },
    eventType(['place', 'kingdom'], ['character', 'army', 'dynasty']),
    {
      id: 'vow',
      name: 'Vow, curse or boon',
      plural: 'Vows, curses and boons',
      icon: 'scroll',
      color: 'cat-6',
      group: 'Lore',
      traits: ['setup'],
      fields: [
        { key: 'kind', label: 'Kind', kind: 'enum', options: ['vow', 'curse', 'boon'] },
        { key: 'givenBy', label: 'Given by', kind: 'entityRef', refs: ['character'] },
        { key: 'bound', label: 'Binds', kind: 'entityRefList', refs: ['character'] },
        { key: 'terms', label: 'Terms', kind: 'richtext' },
        { key: 'fulfilled', label: 'Fulfilled', kind: 'boolean', timeVarying: true },
      ],
    },
    secretType,
  ],
  links: [
    ...kinshipLinks('character', 'dynasty'),
    {
      label: 'rules',
      inverse: 'ruled by',
      kind: 'relation',
      from: ['character', 'dynasty'],
      to: ['kingdom'],
    },
    {
      label: 'lies within',
      inverse: 'contains',
      kind: 'location',
      from: ['place', 'kingdom'],
      to: ['place', 'kingdom'],
    },
    ...geoLinks(['place', 'kingdom'], []),
    {
      label: 'holds',
      inverse: 'held by',
      kind: 'ownership',
      from: ['character'],
      to: ['astra', 'weapon'],
    },
  ],
};

const fantasy: BuiltInTemplate = {
  key: 'fantasy',
  ...TEMPLATE_INFO.fantasy,
  groups: ['Civilisation', 'Land', 'War', 'Lore'],
  units: [
    { key: 'mile', name: 'Mile', abbr: 'mi', toBase: 1 },
    { key: 'league', name: 'League', abbr: 'lg', toBase: 3 },
  ],
  calendar: calendar('Common reckoning', 'After Landing', 'AL'),
  types: [
    {
      id: 'character',
      name: 'Character',
      plural: 'Characters',
      icon: 'person',
      color: 'cat-1',
      group: 'Civilisation',
      traits: ['born', 'locatable'],
      fields: characterFields(['place', 'realm']),
    },
    {
      id: 'house',
      name: 'House',
      plural: 'Houses',
      icon: 'shield',
      color: 'cat-2',
      group: 'Civilisation',
      traits: ['institution'],
      fields: [
        { key: 'words', label: 'Words', kind: 'text' },
        { key: 'seat', label: 'Seat', kind: 'entityRef', refs: ['place'] },
        {
          key: 'head',
          label: 'Head of house',
          kind: 'entityRef',
          refs: ['character'],
          timeVarying: true,
        },
      ],
    },
    {
      id: 'realm',
      name: 'Realm',
      plural: 'Realms',
      icon: 'crown',
      color: 'cat-3',
      group: 'Land',
      traits: ['geo', 'institution'],
      fields: [
        { key: 'capital', label: 'Capital', kind: 'entityRef', refs: ['place'] },
        { key: 'ruler', label: 'Ruler', kind: 'entityRef', refs: ['character'], timeVarying: true },
        { key: 'description', label: 'Description', kind: 'richtext' },
      ],
    },
    {
      id: 'place',
      name: 'Place',
      plural: 'Places',
      icon: 'mountain',
      color: 'cat-4',
      group: 'Land',
      traits: ['geo', 'locatable'],
      fields: placeFields(
        ['city', 'castle', 'region', 'river', 'mountain', 'forest', 'sea', 'pass', 'road', 'other'],
        ['place', 'realm'],
      ),
    },
    {
      id: 'army',
      name: 'Army',
      plural: 'Armies',
      icon: 'flag',
      color: 'cat-7',
      group: 'War',
      traits: ['hasStrength', 'locatable'],
      fields: [
        {
          key: 'allegiance',
          label: 'Fights for',
          kind: 'entityRef',
          refs: ['house', 'realm'],
          timeVarying: true,
        },
        {
          key: 'commander',
          label: 'Commander',
          kind: 'entityRef',
          refs: ['character'],
          timeVarying: true,
        },
        { key: 'strength', label: 'Strength', kind: 'number', timeVarying: true },
        {
          key: 'locationKey',
          label: 'Position',
          kind: 'entityRef',
          refs: ['place'],
          timeVarying: true,
        },
      ],
    },
    artifactType('artifact', ['character']),
    ruleSystemType('magic', 'Magic system', 'Magic systems', ['character', 'house']),
    {
      id: 'spell',
      name: 'Spell or ability',
      plural: 'Spells and abilities',
      icon: 'star',
      color: 'cat-5',
      group: 'Lore',
      traits: ['ability', 'holdable'],
      fields: [
        { key: 'effect', label: 'Effect', kind: 'richtext' },
        ...abilityFields('magic', 'spell', ['character']),
      ],
    },
    eventType(['place', 'realm'], ['character', 'army', 'house']),
    secretType,
  ],
  links: [
    ...kinshipLinks('character', 'house'),
    {
      label: 'rules',
      inverse: 'ruled by',
      kind: 'relation',
      from: ['character', 'house'],
      to: ['realm'],
    },
    {
      label: 'lies within',
      inverse: 'contains',
      kind: 'location',
      from: ['place'],
      to: ['place', 'realm'],
    },
    ...geoLinks(['place', 'realm'], []),
    {
      label: 'holds',
      inverse: 'held by',
      kind: 'ownership',
      from: ['character'],
      to: ['artifact', 'spell'],
    },
  ],
};

const space: BuiltInTemplate = {
  key: 'space',
  ...TEMPLATE_INFO.space,
  groups: ['Civilisation', 'Land', 'War', 'Lore'],
  units: [
    { key: 'ly', name: 'Light-year', abbr: 'ly', toBase: 1 },
    { key: 'pc', name: 'Parsec', abbr: 'pc', toBase: 3.26 },
  ],
  calendar: calendar('Standard reckoning', 'Standard Era', 'SE'),
  types: [
    {
      id: 'character',
      name: 'Character',
      plural: 'Characters',
      icon: 'person',
      color: 'cat-1',
      group: 'Civilisation',
      traits: ['born', 'locatable'],
      fields: characterFields(['world', 'ship']),
    },
    {
      id: 'faction',
      name: 'Faction',
      plural: 'Factions',
      icon: 'shield',
      color: 'cat-2',
      group: 'Civilisation',
      traits: ['institution'],
      fields: [
        {
          key: 'leader',
          label: 'Leader',
          kind: 'entityRef',
          refs: ['character'],
          timeVarying: true,
        },
        { key: 'ideology', label: 'Ideology', kind: 'richtext' },
      ],
    },
    {
      id: 'world',
      name: 'World',
      plural: 'Worlds',
      icon: 'planet',
      color: 'cat-4',
      group: 'Land',
      traits: ['geo', 'locatable'],
      fields: placeFields(
        ['galaxy', 'sector', 'system', 'planet', 'moon', 'station', 'city', 'other'],
        ['world'],
      ),
    },
    {
      id: 'ship',
      name: 'Ship',
      plural: 'Ships',
      icon: 'ship',
      color: 'cat-7',
      group: 'War',
      traits: ['transport', 'hasStrength', 'locatable'],
      fields: [
        { key: 'class', label: 'Class', kind: 'text' },
        {
          key: 'captain',
          label: 'Captain',
          kind: 'entityRef',
          refs: ['character'],
          timeVarying: true,
        },
        {
          key: 'allegiance',
          label: 'Flies for',
          kind: 'entityRef',
          refs: ['faction'],
          timeVarying: true,
        },
        {
          key: 'locationKey',
          label: 'Position',
          kind: 'entityRef',
          refs: ['world'],
          timeVarying: true,
        },
      ],
    },
    ruleSystemType('tech', 'Technology or psionics', 'Technologies and psionics', [
      'character',
      'faction',
      'ship',
    ]),
    {
      id: 'power',
      name: 'Ability or device power',
      plural: 'Abilities and device powers',
      icon: 'star',
      color: 'cat-5',
      group: 'Lore',
      traits: ['ability', 'holdable'],
      fields: [
        { key: 'effect', label: 'Effect', kind: 'richtext' },
        ...abilityFields('tech', 'power', ['character', 'ship']),
      ],
    },
    artifactType('artifact', ['character', 'ship']),
    eventType(['world'], ['character', 'ship', 'faction']),
    secretType,
  ],
  links: [
    ...kinshipLinks('character', 'faction'),
    { label: 'lies within', inverse: 'contains', kind: 'location', from: ['world'], to: ['world'] },
    ...geoLinks(['world'], ['ship']),
    {
      label: 'holds',
      inverse: 'held by',
      kind: 'ownership',
      from: ['character', 'ship'],
      to: ['artifact', 'power'],
    },
  ],
};

const blank: BuiltInTemplate = {
  key: 'blank',
  ...TEMPLATE_INFO.blank,
  groups: ['Civilisation', 'Land', 'War', 'Lore'],
  units: [],
  // The bootstrap spec fixes Blank at one era.
  calendar: singleEra('Default calendar', 'Era', 'E'),
  types: [],
  links: [],
};

export const BUILT_IN_TEMPLATES: Record<TemplateKey, BuiltInTemplate> = {
  blank,
  mythological,
  fantasy,
  space,
};

/**
 * The create changes and project settings a template produces. Local type ids become fresh keys,
 * and every reference between types (parents, entry-reference fields, link ends) follows them.
 */
export function applyTemplate(t: BuiltInTemplate): {
  changes: Change[];
  calendarKey: string;
  typeGroups: { key: string; name: string; order: number }[];
  units: Unit[];
} {
  const keyOf = new Map(t.types.map((ty) => [ty.id, uuidv7()]));
  const ref = (id: string) => {
    const k = keyOf.get(id);
    if (!k) throw new Error(`Template ${t.key} refers to unknown type "${id}"`);
    return k;
  };
  const calendarKey = uuidv7();
  const types: Change[] = t.types.map((ty, order) => {
    const data: EntityTypeBody = {
      name: ty.name,
      pluralName: ty.plural,
      icon: ty.icon,
      color: ty.color,
      group: ty.group.toLowerCase(),
      parentTypeKey: ty.parent ? ref(ty.parent) : null,
      traits: ty.traits,
      fields: ty.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        options: f.options ?? [],
        required: f.required ?? false,
        timeVarying: f.timeVarying ?? false,
        refTypeKeys: (f.refs ?? []).map(ref),
      })),
      order,
    };
    return { op: 'create', collection: 'entityTypes', key: ref(ty.id), data };
  });
  const links: Change[] = t.links.map((l) => {
    const data: LinkTypeBody = {
      label: l.label,
      inverseLabel: l.inverse,
      kind: l.kind,
      symmetric: l.symmetric ?? false,
      fromTypeKeys: l.from.map(ref),
      toTypeKeys: l.to.map(ref),
      fields: [],
    };
    return { op: 'create', collection: 'linkTypes', data };
  });
  return {
    changes: [
      { op: 'create', collection: 'calendars', key: calendarKey, data: t.calendar },
      ...types,
      ...links,
    ],
    calendarKey,
    typeGroups: t.groups.map((name, order) => ({ key: name.toLowerCase(), name, order })),
    units: t.units,
  };
}
