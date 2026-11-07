import { describe, expect, it } from 'vitest';
import { entityFieldsSchema, type FieldShape } from './entity-fields';

const f = (key: string, kind: FieldShape['kind'], extra: Partial<FieldShape> = {}): FieldShape => ({
  key,
  label: key,
  kind,
  options: [],
  required: false,
  ...extra,
});

describe('entityFieldsSchema', () => {
  const schema = entityFieldsSchema([
    f('title', 'text', { required: true }),
    f('status', 'enum', { options: ['alive', 'dead'] }),
    f('roles', 'multiEnum', { options: ['warrior', 'teacher'] }),
    f('age', 'number'),
    f('distance', 'quantity'),
    f('born', 'date'),
    f('heir', 'entityRef'),
    f('allies', 'entityRefList'),
    f('army', 'composition'),
    f('regent', 'boolean'),
    f('portrait', 'image'),
    f('epithets', 'list'),
  ]);

  it('accepts valid values and lets optional fields be absent or null', () => {
    const ok = {
      title: 'Grandsire',
      status: 'alive',
      roles: ['warrior'],
      age: null,
      distance: { value: 12, unitKey: 'yojana' },
      born: { start: -120, end: null, precision: 'year' },
      heir: 'k1',
      allies: ['k2'],
      army: [{ label: 'Chariots', count: 3 }],
      regent: true,
      portrait: '0123456789abcdef01234567',
      epithets: ['Devavrata'],
    };
    expect(schema.parse(ok)).toEqual(ok);
    expect(schema.safeParse({ title: 'x' }).success).toBe(true);
  });

  it('rejects wrong kinds, unknown options, unknown keys and blank required text', () => {
    expect(schema.safeParse({ title: 'x', status: 'sleeping' }).success).toBe(false);
    expect(schema.safeParse({ title: 'x', age: 'old' }).success).toBe(false);
    expect(
      schema.safeParse({ title: 'x', born: { start: 1.5, end: null, precision: 'day' } }).success,
    ).toBe(false);
    expect(schema.safeParse({ title: 'x', nope: 1 }).success).toBe(false);
    expect(schema.safeParse({ title: '  ' }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects any value for a choice field with no options', () => {
    expect(entityFieldsSchema([f('c', 'enum')]).safeParse({ c: 'x' }).success).toBe(false);
  });
});
