import { describe, expect, it } from 'vitest';
import type { EntityTypeDto } from '@epic/schemas/api';
import { fieldSteps } from './entry-steps';

type F = EntityTypeDto['fields'][number];
const field = (key: string, kind: F['kind'] = 'text', timeVarying = false): F => ({
  key,
  label: key,
  kind,
  options: [],
  required: false,
  timeVarying,
  refTypeKeys: [],
  ai: 'read',
});
const titles = (fields: F[]) => fieldSteps(fields).map((s) => s.title);

describe('fieldSteps', () => {
  it('has no steps without fields and one step for a short type', () => {
    expect(fieldSteps([])).toEqual([]);
    expect(titles([field('a'), field('b')])).toEqual(['Details']);
  });

  it('groups a long type by the nature of its fields and keeps every field once', () => {
    const fields = [
      ...Array.from({ length: 5 }, (_, i) => field(`fact${i}`, 'number')),
      ...Array.from({ length: 4 }, (_, i) => field(`ref${i}`, 'entityRefList')),
      ...Array.from({ length: 3 }, (_, i) => field(`text${i}`, 'richtext')),
      field('status', 'enum', true),
      field('sources'),
      field('notes', 'richtext'),
    ];
    const steps = fieldSteps(fields);
    expect(steps.map((s) => s.title)).toEqual([
      'Key facts',
      'Connections',
      'Write-up',
      'Changes over time',
      'Sources and notes',
    ]);
    expect(steps.flatMap((s) => s.fields)).toHaveLength(fields.length);
  });

  it('groups a person-like type by theme, with unknown fields under More', () => {
    const keys = 'fullName gender born died hair eyes build temperament fears want need wound lie';
    const fields = [...keys.split(' ').map((k) => field(k)), field('custom')];
    expect(titles(fields)).toEqual([
      'Identity',
      'Life and status',
      'Appearance',
      'Personality',
      'Story',
      'More',
    ]);
  });
});
