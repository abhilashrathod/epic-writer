import { describe, expect, it } from 'vitest';
import { entityTypeInput } from '@epic/schemas/api';
import { applyTemplate, BUILT_IN_TEMPLATES } from './templates';

describe('built-in templates', () => {
  for (const t of Object.values(BUILT_IN_TEMPLATES)) {
    it(`${t.key}: every type passes the user-facing type schema and every reference resolves`, () => {
      const { changes, calendarKey, typeGroups } = applyTemplate(t);
      const types = changes.filter((c) => c.op === 'create' && c.collection === 'entityTypes');
      const keys = new Set(types.map((c) => (c.op === 'create' ? c.key : '')));
      expect(types).toHaveLength(t.types.length);
      expect(changes[0]).toMatchObject({ op: 'create', collection: 'calendars', key: calendarKey });

      for (const c of types) {
        if (c.op !== 'create') continue;
        const body = entityTypeInput.parse(c.data);
        expect(typeGroups.map((g) => g.key)).toContain(body.group);
        for (const f of body.fields) for (const k of f.refTypeKeys) expect(keys).toContain(k);
      }
      for (const c of changes.filter((c) => c.collection === 'linkTypes')) {
        if (c.op !== 'create') continue;
        const { fromTypeKeys, toTypeKeys } = c.data as {
          fromTypeKeys: string[];
          toTypeKeys: string[];
        };
        for (const k of [...fromTypeKeys, ...toTypeKeys]) expect(keys).toContain(k);
      }
    });
  }

  it('gives each application fresh keys', () => {
    const a = applyTemplate(BUILT_IN_TEMPLATES.mythological);
    const b = applyTemplate(BUILT_IN_TEMPLATES.mythological);
    expect(a.calendarKey).not.toBe(b.calendarKey);
  });
});
