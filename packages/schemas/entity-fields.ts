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
    shape[f.key] = f.required
      ? f.kind === 'text' || f.kind === 'richtext'
        ? z.string().trim().min(1, `${f.label} is required`)
        : v
      : v.nullable().optional();
  }
  return z.strictObject(shape);
}
