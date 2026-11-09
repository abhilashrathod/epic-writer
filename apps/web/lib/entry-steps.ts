import type { EntityTypeDto } from '@epic/schemas/api';

type FieldDef = EntityTypeDto['fields'][number];

export interface FieldStep {
  title: string;
  fields: FieldDef[];
}

/** Up to this many fields fit on one step without scrolling much. */
const SINGLE_STEP_MAX = 12;
const CLOSING = new Set(['sources', 'notes']);
const CLOSING_TITLE = 'Sources and notes';

// Person-like types share these field keys. Matched by keys, so custom types can use them too.
const PROFILE_SECTIONS: [string, string[]][] = [
  [
    'Identity',
    'description fullName title gender speciesRace culture family occupation socialClass religion languages literacy'.split(
      ' ',
    ),
  ],
  [
    'Life and status',
    'born died birthplace placeOfDeath causeOfDeath status locationKey allegiance rankKey'.split(
      ' ',
    ),
  ],
  [
    'Appearance',
    'apparentAge height build complexion hair eyes distinguishingMarks typicalAttire physicalCondition disabilitiesOrAfflictions voiceAndBearing'.split(
      ' ',
    ),
  ],
  [
    'Personality',
    'temperament traits virtues flawsAndVices strengths weaknesses fears valuesAndBeliefs moralCode likes dislikes habitsAndMannerisms hobbies'.split(
      ' ',
    ),
  ],
  [
    'Story',
    'role archetype want need motivation wound lie theTruthTheyLearn internalConflict externalConflict stakes arcType arcSummary turningPoints backstory secrets fate'.split(
      ' ',
    ),
  ],
  [
    'Voice',
    'voice vocabularyAndRegister catchphrases verbalTics voiceSamples neverSays'.split(' '),
  ],
  [
    'Abilities and possessions',
    'skills abilitiesAndPowers knownAstrasTechniques teachers weaponsHeld possessions boonsAndCurses vowsSworn wealth'.split(
      ' ',
    ),
  ],
  ['Production', ['castingNotes', 'costumeNotes']],
];
const PROFILE_OTHER = 'More';
const SECTION_OF = new Map(
  PROFILE_SECTIONS.flatMap(([title, keys]) => keys.map((k) => [k, title] as const)),
);

const GENERIC_ORDER = ['Key facts', 'Connections', 'Write-up', 'Changes over time'];
function genericSection(f: FieldDef): string {
  if (f.timeVarying) return 'Changes over time';
  if (['entityRef', 'entityRefList', 'narrativeRef', 'narrativeRefList'].includes(f.kind))
    return 'Connections';
  if (f.kind === 'richtext' || f.kind === 'list' || f.kind === 'composition') return 'Write-up';
  return 'Key facts';
}

/** Splits a type's fields into wizard steps, by theme for profiles and by nature otherwise. */
export function fieldSteps(fields: FieldDef[]): FieldStep[] {
  if (fields.length === 0) return [];
  if (fields.length <= SINGLE_STEP_MAX) return [{ title: 'Details', fields }];
  const body = fields.filter((f) => !CLOSING.has(f.key));
  const isProfile = body.filter((f) => SECTION_OF.has(f.key)).length >= body.length * 0.6;
  const sectionOf = (f: FieldDef) =>
    isProfile ? (SECTION_OF.get(f.key) ?? PROFILE_OTHER) : genericSection(f);
  const order = isProfile ? [...PROFILE_SECTIONS.map(([t]) => t), PROFILE_OTHER] : GENERIC_ORDER;
  return [
    ...order.map((title) => ({ title, fields: body.filter((f) => sectionOf(f) === title) })),
    { title: CLOSING_TITLE, fields: fields.filter((f) => CLOSING.has(f.key)) },
  ].filter((s) => s.fields.length > 0);
}
