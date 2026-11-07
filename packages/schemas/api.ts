import { z } from 'zod';
import { FIELD_KINDS, storyTimeSchema } from './entity-fields';

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

export const createWorkBody = z.object({
  name: z.string().trim().min(1, 'Name the work').max(200),
  medium: z.enum(WORK_MEDIA),
});

export const createDocumentBody = z.object({
  workKey: z.string().min(1),
  parentKey: z.string().min(1).nullable(),
  title: z.string().trim().max(200).optional(),
});

export const updateDocumentBody = z.union([
  z.object({ title: z.string().trim().min(1, 'Title is empty').max(200) }),
  z.object({ move: z.enum(['up', 'down']) }),
  z.object({ storyTime: storyTimeSchema.nullable() }),
]);

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
  refTypeKeys: z.array(z.string().min(1)).max(20).default([]),
});

export const entityTypeInput = z
  .object({
    name: z.string().trim().min(1, 'Name the type').max(80),
    pluralName: z.string().trim().min(1, 'Give the plural').max(80),
    icon: z.string().max(32).default('circle'),
    color: z.enum(TYPE_COLORS).default('cat-1'),
    group: z.string().trim().min(1, 'Pick a group').max(60),
    parentTypeKey: z.string().min(1).nullable().default(null),
    traits: z.array(z.enum(TRAITS)).default([]),
    fields: z.array(fieldDefInput).max(60).default([]),
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
});

export type EntityInput = z.infer<typeof entityInput>;

export interface EntityDto extends EntityInput {
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
