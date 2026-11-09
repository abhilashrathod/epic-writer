import { z } from 'zod';

/** The parts of a field definition that decide validation (matches FieldDef in packages/db). */
export interface FieldShape {
  key: string;
  label: string;
  kind:
    | 'text'
    | 'richtext'
    | 'number'
    | 'quantity'
    | 'date'
    | 'enum'
    | 'multiEnum'
    | 'boolean'
    | 'entityRef'
    | 'entityRefList'
    | 'image'
    | 'list'
    | 'composition';
  options: string[];
  required: boolean;
}

export const FIELD_KINDS = [
  'text',
  'richtext',
  'number',
  'quantity',
  'date',
  'enum',
  'multiEnum',
  'boolean',
  'entityRef',
  'entityRefList',
  'image',
  'list',
  'composition',
] as const satisfies readonly FieldShape['kind'][];

export const FIELD_AI = ['extract', 'read', 'hidden'] as const;
export type FieldAiAccess = (typeof FIELD_AI)[number];

const LEGACY_HIDDEN = new Set(['notes', 'castingNotes', 'costumeNotes']);
const LEGACY_READ = new Set([
  'role',
  'want',
  'need',
  'wound',
  'lie',
  'voice',
  'description',
  'truth',
]);

/**
 * What the AI may do with a field. Types saved before `ai` existed were all extractable, so they
 * keep that, except fields that are the writer's own intent or private notes.
 */
export function fieldAi(f: { key: string; ai?: FieldAiAccess }): FieldAiAccess {
  if (f.ai) return f.ai;
  return LEGACY_HIDDEN.has(f.key) ? 'hidden' : LEGACY_READ.has(f.key) ? 'read' : 'extract';
}

export const storyTimeSchema = z.object({
  start: z.number().int(),
  end: z.number().int().nullable(),
  precision: z.enum(['day', 'month', 'year', 'era', 'unknown']),
});

const key = z.string().min(1).max(64);

function valueSchema(f: FieldShape): z.ZodType {
  switch (f.kind) {
    case 'text':
    case 'richtext':
      return z.string().max(100_000);
    case 'number':
      return z.number().finite();
    case 'quantity':
      return z.object({ value: z.number().finite(), unitKey: key });
    case 'date':
      return storyTimeSchema;
    case 'enum':
      return f.options.length ? z.enum(f.options as [string, ...string[]]) : z.never();
    case 'multiEnum':
      return z.array(f.options.length ? z.enum(f.options as [string, ...string[]]) : z.never());
    case 'boolean':
      return z.boolean();
    case 'entityRef':
      return key;
    case 'entityRefList':
      return z.array(key);
    case 'image':
      return z.string().regex(/^[0-9a-f]{24}$/, 'must be an asset id');
    case 'list':
      return z.array(z.string().max(10_000));
    case 'composition':
      return z.array(
        z.object({ label: z.string().min(1).max(200), count: z.number().int().min(0) }),
      );
  }
}

/**
 * Builds the validator for an entry's `fields` from its type (AGENTS.md rule 8). Unknown keys are
 * rejected; optional fields may be absent or null; required fields must be present and non-empty.
 */
export function entityFieldsSchema(fields: readonly FieldShape[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    const v = valueSchema(f);
    if (!f.required) {
      shape[f.key] = v.nullable().optional();
      continue;
    }
    const present = z.custom((x) => x !== undefined && x !== null, {
      message: `${f.label} is required`,
    });
    const value =
      f.kind === 'text' || f.kind === 'richtext'
        ? z.string().trim().min(1, `${f.label} is required`)
        : v;
    shape[f.key] = present.pipe(value);
  }
  return z.strictObject(shape);
}
