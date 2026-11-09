import { z } from 'zod';
import { FIELD_KINDS, storyTimeSchema, FIELD_AI } from './entity-fields';

export const TEMPLATE_KEYS = ['blank', 'mythological', 'fantasy', 'space'] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Shown when choosing a template; the full definitions live in packages/core/templates.ts. */
export const TEMPLATE_INFO: Record<
  (typeof TEMPLATE_KEYS)[number],
  { name: string; description: string }
> = {
  blank: { name: 'Blank', description: 'Start empty and define your own entry types.' },
  mythological: {
    name: 'Mythological epic',
    description: 'Dynasties, kingdoms, divine weapons, vows and curses.',
  },
  fantasy: {
    name: 'Epic fantasy',
    description: 'Great houses, realms, armies and a magic system with costs.',
  },
  space: { name: 'Space opera', description: 'Factions, star systems, ships and technology.' },
};

export const createProjectBody = z.object({
  name: z.string().trim().min(1, 'Name the project').max(200, 'Keep the name under 200 characters'),
  templateKey: z.enum(TEMPLATE_KEYS).default('blank'),
});

export const preferencesBody = z
  .object({
    skin: z.enum(['ink', 'sand']).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .refine((v) => v.skin !== undefined || v.theme !== undefined, 'Send skin or theme');

export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
  commitCount: number;
  archived: boolean;
}

export const WORK_MEDIA = [
  'series',
  'novel',
  'film',
  'trilogy',
  'short',
  'stage',
  'game',
  'other',
] as const;

/** WK-2: a work's structure, outermost first (Book → Part → Chapter). The last level holds text. */
export const levelNamesSchema = z
  .array(
    z.object({
      singular: z.string().trim().min(1, 'Name every level').max(40),
      plural: z.string().trim().min(1, 'Give every level a plural').max(40),
    }),
  )
  .min(1, 'A work needs at least one level')
  .max(5, 'A work can have at most five levels');
export type LevelNames = z.infer<typeof levelNamesSchema>;

/** Default structure per medium, used when a new work doesn't set its own. */
export const DEFAULT_LEVELS: Record<(typeof WORK_MEDIA)[number], LevelNames> = {
  series: [
    { singular: 'Season', plural: 'Seasons' },
    { singular: 'Episode', plural: 'Episodes' },
  ],
  film: [{ singular: 'Script', plural: 'Scripts' }],
  short: [{ singular: 'Script', plural: 'Scripts' }],
  stage: [{ singular: 'Act', plural: 'Acts' }],
  game: [{ singular: 'Chapter', plural: 'Chapters' }],
  novel: [{ singular: 'Chapter', plural: 'Chapters' }],
  trilogy: [
    { singular: 'Book', plural: 'Books' },
    { singular: 'Chapter', plural: 'Chapters' },
  ],
  other: [{ singular: 'Part', plural: 'Parts' }],
};

export const createWorkBody = z.object({
  name: z.string().trim().min(1, 'Name the work').max(200),
  medium: z.enum(WORK_MEDIA),
  levels: levelNamesSchema.optional(),
});

export const updateWorkBody = z.object({ levels: levelNamesSchema });

export const createDocumentBody = z.object({
  workKey: z.string().min(1),
  parentKey: z.string().min(1).nullable(),
  title: z.string().trim().max(200).optional(),
});

export const updateDocumentBody = z.union([
  z.object({ title: z.string().trim().min(1, 'Title is empty').max(200) }),
  z.object({ move: z.enum(['up', 'down']) }),
  z.object({ storyTime: storyTimeSchema.nullable() }),
  z.object({ details: z.lazy(() => documentDetailsSchema) }),
]);

/** WK-5: episodes and chapters have a logline, summary and key events; containers an arc summary. */
export const documentDetailsSchema = z
  .object({
    logline: z.string().trim().max(500),
    summary: z.string().trim().max(20_000),
    keyEventKeys: z.array(z.string().min(1)).max(100),
    arcSummary: z.string().trim().max(20_000),
  })
  .partial();
export type DocumentDetails = z.infer<typeof documentDetailsSchema>;

export interface WorkDto {
  key: string;
  name: string;
  medium: (typeof WORK_MEDIA)[number];
  levels: { key: string; singular: string; plural: string }[];
}

export interface DocumentDto {
  key: string;
  workKey: string;
  parentKey: string | null;
  levelKey: string;
  kind: 'container' | 'text';
  format: 'fountain' | 'markdown';
  title: string;
  number: number;
  orderPath: string;
  /** When the episode or chapter happens in story time; opening it moves "as of" here (WK-7). */
  storyTime: z.infer<typeof storyTimeSchema> | null;
  logline: string;
  summary: string;
  arcSummary: string;
  keyEventKeys: string[];
}

export interface TreeDto {
  works: WorkDto[];
  documents: DocumentDto[];
}

export interface DocumentTextDto {
  document: DocumentDto;
  text: string;
  version: number;
}

/** ~5 MB of text: far beyond a feature script, small enough to reject accidents. */
const MAX_TEXT = 5_000_000;

export const saveTextBody = z.object({
  text: z.string().max(MAX_TEXT, 'This document is too large to save'),
  baseVersion: z.number().int().min(0),
});

export const createSnapshotBody = z.object({
  label: z.string().trim().max(200).default(''),
  text: z.string().max(MAX_TEXT).optional(),
});

export const restoreBody = z.object({ baseVersion: z.number().int().min(0) });

export interface VersionDto {
  id: string;
  reason: 'autosave-checkpoint' | 'manual' | 'before-ai' | 'commit' | 'import';
  label: string;
  version: number;
  wordCount: number;
  createdAt: string;
}

/** Body of a 409 from a save: the text and version currently on the server. */
export interface SaveConflictDto {
  error: string;
  current: { text: string; version: number };
}

export const TRAITS = [
  'born',
  'locatable',
  'holdable',
  'hasStrength',
  'ranked',
  'position',
  'institution',
  'ruleSystem',
  'ability',
  'event',
  'secret',
  'setup',
  'account',
  'transport',
  'resource',
  'term',
  'geo',
] as const;

/** Entry type colours are token names (`--cat-1`...), never hex: see packages/ui/tokens.css. */
export const TYPE_COLORS = [
  'cat-1',
  'cat-2',
  'cat-3',
  'cat-4',
  'cat-5',
  'cat-6',
  'cat-7',
  'cat-8',
] as const;

export const fieldDefInput = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Field keys are camelCase letters and digits'),
  label: z.string().trim().min(1, 'Name the field').max(80),
  kind: z.enum(FIELD_KINDS),
  options: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  required: z.boolean().default(false),
  timeVarying: z.boolean().default(false),
  refTypeKeys: z.array(z.string().min(1)).max(120).default([]),
  ai: z.enum(FIELD_AI).default('read'),
});

export const entityTypeInput = z
  .object({
    name: z.string().trim().min(1, 'Name the type').max(80),
    pluralName: z.string().trim().min(1, 'Give the plural').max(80),
    description: z.string().trim().max(400).default(''),
    icon: z.string().max(32).default('circle'),
    color: z.enum(TYPE_COLORS).default('cat-1'),
    group: z.string().trim().min(1, 'Pick a group').max(60),
    parentTypeKey: z.string().min(1).nullable().default(null),
    traits: z.array(z.enum(TRAITS)).default([]),
    fields: z.array(fieldDefInput).max(150).default([]),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.fields.forEach((f, i) => {
      if (seen.has(f.key))
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'key'],
          message: `Two fields use the key "${f.key}"`,
        });
      seen.add(f.key);
      if ((f.kind === 'enum' || f.kind === 'multiEnum') && f.options.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['fields', i, 'options'],
          message: `"${f.label}" needs at least one choice`,
        });
      }
    });
  });

export type EntityTypeInput = z.infer<typeof entityTypeInput>;

export interface EntityTypeDto extends EntityTypeInput {
  key: string;
  order: number;
}

export const applyTypeTemplateInput = z.object({ id: z.string().min(1).max(80) });

/** One catalogue type in the "Create from template" picker. */
export interface TypeTemplateDto {
  id: string;
  name: string;
  icon: string;
  color: string;
  group: string;
  templates: string[];
  fieldCount: number;
  /** The project type this template would extend, if it has one already. */
  existingKey: string | null;
  missingFieldCount: number;
  /** Lower-case name, group, field labels and choices. */
  search: string;
}

export const PROMINENCE = ['main', 'supporting', 'minor', 'background'] as const;
export const CANON_STATES = ['canon', 'tentative', 'scrapped'] as const;

/** Entry body from the client. `fields` is validated against the entry's type in core. */
export const entityInput = z.object({
  typeKey: z.string().min(1, 'Pick a type'),
  name: z.string().trim().min(1, 'Name the entry').max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  summary: z.string().trim().max(5_000).default(''),
  prominence: z.enum(PROMINENCE).default('minor'),
  canonState: z.enum(CANON_STATES).default('canon'),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
  /** CX-5. Left out, an edit keeps the entry's images (AI proposals never send them). */
  images: z
    .array(
      z.object({
        assetId: z.string().regex(/^[0-9a-f]{24}$/, 'Unknown image'),
        caption: z.string().trim().max(300).default(''),
        primary: z.boolean().default(false),
      }),
    )
    .max(50)
    .optional(),
});

export type EntityInput = z.infer<typeof entityInput>;
export type EntityImageDto = NonNullable<EntityInput['images']>[number];

export interface EntityDto extends EntityInput {
  images: EntityImageDto[];
  key: string;
  slug: string;
  updatedAt: string;
}

export const mergeBody = z.object({ keepKey: z.string().min(1), mergeKey: z.string().min(1) });

export const LINK_KINDS = [
  'kinship',
  'relation',
  'causal',
  'ownership',
  'location',
  'teaching',
  'membership',
  'knowledge',
  'narrative',
] as const;

export const linkTypeInput = z.object({
  label: z.string().trim().min(1, 'Name the connection, e.g. "parent of"').max(60),
  inverseLabel: z.string().trim().min(1, 'Give the reverse name, e.g. "child of"').max(60),
  kind: z.enum(LINK_KINDS),
  symmetric: z.boolean().default(false),
  fromTypeKeys: z.array(z.string().min(1)).max(50).default([]),
  toTypeKeys: z.array(z.string().min(1)).max(50).default([]),
});

export interface LinkTypeDto extends z.infer<typeof linkTypeInput> {
  key: string;
}

export const narrativeRefSchema = z.object({
  workKey: z.string().min(1),
  documentKey: z.string().min(1),
  sceneKey: z.string(),
  order: z.string().regex(/^\d{4}(\.\d{4})*$/, 'order is a zero-padded path like 0001.0002'),
});

export const linkInput = z.object({
  typeKey: z.string().min(1, 'Pick a kind of connection'),
  fromKey: z.string().min(1),
  toKey: z.string().min(1, 'Pick who or what to connect to'),
  note: z.string().trim().max(1_000).default(''),
  canonState: z.enum(CANON_STATES).default('canon'),
  /** When the connection begins in story time; before it, views treat it as future (dotted). */
  storyTime: storyTimeSchema.nullable().default(null),
  /** Where each work reveals it; until then it stays hidden (e.g. secret parentage, GR-1). */
  narrativeRefs: z.array(narrativeRefSchema).max(20).default([]),
});

/** One connection seen from a given entry: `label` already reads from that entry's side. */
export interface ConnectionDto {
  key: string;
  kind: (typeof LINK_KINDS)[number];
  label: string;
  otherKey: string;
  note: string;
  canonState: (typeof CANON_STATES)[number];
}

export interface RelationsDto {
  connections: ConnectionDto[];
  referencedBy: { entityKey: string; fieldLabel: string }[];
  appearances: {
    documentKey: string;
    documentTitle: string;
    sceneKey: string;
    heading: string;
    order: string;
    /** The entry's first appearance in this scene's work (CX-5). */
    first: boolean;
  }[];
}

/** A change to a time-varying field (CX-3): from story time `storyTime`, `field` is `value`. */
export const factInput = z.object({
  entityKey: z.string().min(1),
  field: z.string().min(1),
  value: z.unknown(),
  storyTime: storyTimeSchema,
  narrativeRefs: z.array(narrativeRefSchema).max(20).default([]),
  causeKey: z.string().min(1).nullable().default(null),
  canonState: z.enum(CANON_STATES).default('canon'),
});

export interface FactDto {
  key: string;
  entityKey: string;
  field: string;
  value: unknown;
  storyTime: z.infer<typeof storyTimeSchema>;
  narrativeRefs: z.infer<typeof narrativeRefSchema>[];
  causeKey: string | null;
  canonState: (typeof CANON_STATES)[number];
}

export interface LinkDto {
  key: string;
  typeKey: string;
  kind: (typeof LINK_KINDS)[number];
  fromKey: string;
  toKey: string;
  storyTime: z.infer<typeof storyTimeSchema> | null;
  narrativeRefs: z.infer<typeof narrativeRefSchema>[];
  canonState: (typeof CANON_STATES)[number];
  note: string;
}

/** Everything the time-aware views need, resolved client-side with @epic/core/asof. */
export interface WorldDto {
  entities: EntityDto[];
  links: LinkDto[];
  facts: FactDto[];
}

export const AI_PROVIDERS = ['anthropic', 'openai', 'openrouter'] as const;

export const aiKeyInput = z.object({
  provider: z.enum(AI_PROVIDERS),
  key: z.string().trim().min(8, 'Paste the whole API key').max(500),
  label: z.string().trim().max(60).default(''),
});

export interface AiKeyDto {
  provider: (typeof AI_PROVIDERS)[number];
  label: string;
  last4: string;
}

const modelId = z.string().trim().max(120).default('');
export const aiSettingsInput = z.object({
  provider: z.enum(AI_PROVIDERS),
  /** Blank means "use the suggested model for this provider". */
  models: z.object({
    extraction: modelId,
    continuity: modelId,
    suggestions: modelId,
    chat: modelId,
    embedding: modelId,
    classification: modelId,
  }),
  /** 0 means no cap. */
  monthlyCapMicros: z.number().int().min(0).max(1_000_000_000),
});

export interface AiSettingsDto extends z.infer<typeof aiSettingsInput> {
  /** Providers the project owner has a key for. */
  keyProviders: (typeof AI_PROVIDERS)[number][];
  spend: { monthTotal: number; byTask: Record<string, number> };
}

export const AI_JOB_TYPES = ['extract', 'continuity', 'ask'] as const;

export const enqueueJobBody = z.object({
  type: z.enum(AI_JOB_TYPES),
  input: z.record(z.string(), z.unknown()).default({}),
});

export interface JobDto {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: { done: number; total: number };
  output: Record<string, unknown>;
  costMicros: number;
  error: string | null;
}

// ---------- commit history (BR-2) ----------

export const commitSeqParam = z.coerce.number().int().positive();
export const commitsQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// ---------- project settings (PR-1, PR-4, PR-5, PR-6, PR-7) ----------

const text = (max: number) => z.string().trim().max(max);
const list = (max: number, each = 200) => z.array(text(each).min(1)).max(max);

export const overviewSchema = z.object({
  logline: text(500),
  tagline: text(200),
  synopsisShort: text(2_000),
  synopsisLong: text(50_000),
  premise: text(5_000),
  genres: list(20, 60),
  tone: text(500),
  hook: text(2_000),
  arc: text(10_000),
  keyQuestions: list(50, 500),
  themeKeys: z.array(z.string().min(1)).max(50),
});
export type OverviewDto = z.infer<typeof overviewSchema>;

export const INSPIRATION_KINDS = [
  'book',
  'film',
  'series',
  'myth',
  'art',
  'music',
  'other',
] as const;
export const inspirationSchema = z.object({
  title: text(200).min(1, 'Every inspiration needs a title'),
  kind: z.enum(INSPIRATION_KINDS),
  creator: text(200),
  note: text(2_000),
  url: z.union([
    z.literal(''),
    z.string().trim().url('Links must be full web addresses').max(2_000),
  ]),
});
export type InspirationDto = z.infer<typeof inspirationSchema>;

export const unitSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Unit keys are short camelCase words'),
  name: text(60).min(1, 'Every unit needs a name'),
  abbr: text(12).min(1, 'Every unit needs an abbreviation'),
  toBase: z.number().finite().positive('A unit’s size must be more than zero'),
});
export type UnitDto = z.infer<typeof unitSchema>;

export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
export const visualSchema = z.object({
  palette: z.array(z.string().regex(HEX_COLOUR, 'Colours are six-digit hex codes')).max(24),
  moodKeywords: list(50, 60),
  moodboardAssetIds: z.array(z.string().regex(/^[0-9a-f]{24}$/)).max(100),
});
export type VisualInput = z.infer<typeof visualSchema>;

export const updateProjectBody = z.union([
  z.object({ name: text(200).min(1, 'Project name is empty') }),
  z.object({ archived: z.boolean() }),
  z.object({ overview: overviewSchema }),
  z.object({ inspirations: z.array(inspirationSchema).max(200) }),
  z.object({ units: z.array(unitSchema).max(50) }),
  z.object({ visual: visualSchema }),
  z.object({ defaultCalendarKey: z.string().min(1) }),
]);

export interface ProjectSettingsDto {
  name: string;
  archived: boolean;
  overview: OverviewDto;
  inspirations: InspirationDto[];
  units: UnitDto[];
  visual: { palette: string[]; moodKeywords: string[]; moodboard: UploadedImageDto[] };
  defaultCalendarKey: string;
  calendars: CalendarDto[];
}

// ---------- calendars (PR-3) ----------

export const calendarSchema = z
  .object({
    name: text(80).min(1, 'Every calendar needs a name'),
    /** The story day on which this calendar's day 0 falls: several calendars share one timeline. */
    epochOffset: z.number().int().safe(),
    months: z
      .array(
        z.object({
          name: text(40).min(1, 'Every month needs a name'),
          days: z.number().int().min(1, 'A month has at least one day').max(1000),
        }),
      )
      .min(1, 'A calendar needs at least one month')
      .max(100),
    daysPerWeek: z.number().int().min(1).max(30),
    weekdayNames: z.array(text(40).min(1, 'Every weekday needs a name')).max(30),
    eras: z
      .array(
        z.object({
          name: text(80).min(1, 'Every era needs a name'),
          abbr: text(12),
          startDay: z.number().int().safe(),
          direction: z.union([z.literal(1), z.literal(-1)]),
        }),
      )
      .min(1, 'A calendar needs at least one era')
      .max(50),
    displayFormat: text(80).refine((f) => /\{(day|month|year|era)\}/.test(f), {
      message: 'The display format needs at least one of {day}, {month}, {year}, {era}',
    }),
  })
  .refine((c) => c.weekdayNames.length === 0 || c.weekdayNames.length === c.daysPerWeek, {
    message: 'Name every weekday, or none',
    path: ['weekdayNames'],
  })
  .refine((c) => new Set(c.eras.map((e) => e.startDay)).size === c.eras.length, {
    message: 'Two eras can’t start on the same day',
    path: ['eras'],
  });
export type CalendarInput = z.infer<typeof calendarSchema>;
export interface CalendarDto extends CalendarInput {
  key: string;
}

// ---------- image uploads ----------

export const startUploadBody = z.object({
  mime: z.string().min(1).max(100),
  size: z.number().int().positive(),
});
export const finishUploadBody = z.object({
  storageKey: z.string().min(1).max(200),
  width: z.number().int().positive().max(100_000).nullable(),
  height: z.number().int().positive().max(100_000).nullable(),
});
export interface UploadedImageDto {
  id: string;
  url: string;
}

export const factCanonBody = z.object({ canonState: z.enum(CANON_STATES) });
