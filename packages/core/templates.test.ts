import { describe, expect, it } from 'vitest';
import { entityTypeInput } from '@epic/schemas/api';
import { formatStoryTime } from './calendar';
import { applyTemplate, BUILT_IN_TEMPLATES } from './templates';

describe('built-in templates', () => {
  for (const t of Object.values(BUILT_IN_TEMPLATES)) {
    if (t.key !== 'blank')
      it(`${t.key}: has geography links, a full rule system, abilities and changing artifacts (EP-1, 5, 6)`, () => {
        expect(t.links.map((l) => l.label)).toEqual(
          expect.arrayContaining(['borders', 'flows through', 'crosses']),
        );
        const fieldsOf = (trait: string) =>
          t.types.filter((x) => x.traits.includes(trait as never)).map((x) => x.fields);
        const [rules] = fieldsOf('ruleSystem');
        expect(rules!.map((f) => f.key)).toEqual(
          expect.arrayContaining(['source', 'cost', 'limits', 'users', 'counters', 'conditions']),
        );
        for (const ability of fieldsOf('ability'))
          expect(ability.map((f) => f.key)).toEqual(
            expect.arrayContaining(['system', 'charges', 'conditions', 'holderKey']),
          );
        const artifact = t.types.find((x) => x.name === 'Weapon or artifact')!;
        expect(artifact.fields.find((f) => f.key === 'properties')?.timeVarying).toBe(true);
      });

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

  it('gives story templates an era before the epoch, so early dates read like BC', () => {
    const cal = BUILT_IN_TEMPLATES.mythological.calendar;
    expect(formatStoryTime(cal, { start: -3600, end: null, precision: 'year' })).toBe('10 BA');
    expect(formatStoryTime(cal, { start: 0, end: null, precision: 'year' })).toBe('1 A');
  });

  it('gives each application fresh keys', () => {
    const a = applyTemplate(BUILT_IN_TEMPLATES.mythological);
    const b = applyTemplate(BUILT_IN_TEMPLATES.mythological);
    expect(a.calendarKey).not.toBe(b.calendarKey);
  });
});
