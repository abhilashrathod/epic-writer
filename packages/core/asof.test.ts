import { describe, expect, it } from 'vitest';
import {
  ageAt,
  END_OF_TIME,
  formatPoint,
  hasHappened,
  isRevealed,
  lifeAt,
  lifeFields,
  lifeStatus,
  pointPrecision,
  resolveFields,
  timedStatus,
  type AsOf,
} from './asof';
import { DEFAULT_CALENDAR } from './create-project';

const at = (
  storyTime: number | null,
  order: string | null = null,
  workKey: string | null = 'w1',
): AsOf => ({ storyTime, workKey: order ? workKey : null, order });
const st = (start: number) => ({ start, end: null, precision: 'year' as const });
const fact = (
  key: string,
  field: string,
  value: unknown,
  start: number,
  refs: { workKey: string; order: string }[] = [],
  canonState = 'canon',
) => ({
  key,
  entityKey: 'e',
  field,
  value,
  storyTime: st(start),
  narrativeRefs: refs,
  canonState,
});

describe('as of', () => {
  it('treats untimed and unknown-time things as always having happened', () => {
    expect(hasHappened(null, at(0))).toBe(true);
    expect(hasHappened({ start: 99, end: null, precision: 'unknown' }, at(0))).toBe(true);
    expect(hasHappened(st(5), at(4))).toBe(false);
    expect(hasHappened(st(5), END_OF_TIME)).toBe(true);
  });

  it('reveals by narrative order within the work being read', () => {
    const refs = [{ workKey: 'w1', order: '0001.0003' }];
    expect(isRevealed(refs, at(null, '0001.0002'))).toBe(false);
    expect(isRevealed(refs, at(null, '0001.0003'))).toBe(true);
    expect(isRevealed(refs, at(null, '0001.0001', 'w2'))).toBe(true); // other works: common knowledge
    expect(isRevealed([], at(null, '0001.0001'))).toBe(true);
  });

  it('marks scrapped, future and past', () => {
    expect(
      timedStatus({ storyTime: st(1), narrativeRefs: [], canonState: 'scrapped' }, END_OF_TIME),
    ).toBe('scrapped');
    expect(timedStatus({ storyTime: st(10), narrativeRefs: [], canonState: 'canon' }, at(5))).toBe(
      'future',
    );
  });

  it('resolves the latest applicable fact per field, falling back to the starting value', () => {
    const facts = [
      fact('a', 'status', 'wounded', 10),
      fact('b', 'status', 'dead', 20),
      fact('c', 'holderKey', 'k2', 15, [{ workKey: 'w1', order: '0001.0005' }]),
      fact('d', 'status', 'cursed', 12, [], 'scrapped'),
    ];
    const start = { status: 'alive', holderKey: 'k1' };
    expect(resolveFields(start, facts, at(5))).toEqual({ status: 'alive', holderKey: 'k1' });
    expect(resolveFields(start, facts, at(16))).toEqual({ status: 'wounded', holderKey: 'k2' });
    expect(resolveFields(start, facts, at(16, '0001.0004'))).toEqual({
      status: 'wounded',
      holderKey: 'k1',
    }); // not yet revealed
    expect(resolveFields(start, facts, END_OF_TIME)).toEqual({ status: 'dead', holderKey: 'k2' });
  });

  it('finds life fields by key, else by order', () => {
    expect(
      lifeFields([
        { key: 'died', kind: 'date' },
        { key: 'born', kind: 'date' },
      ]),
    ).toEqual({ born: 'born', died: 'died' });
    expect(
      lifeFields([
        { key: 'arrived', kind: 'date' },
        { key: 'left', kind: 'date' },
      ]),
    ).toEqual({ born: 'arrived', died: 'left' });
    expect(lifeFields([{ key: 'name', kind: 'text' }])).toEqual({
      born: undefined,
      died: undefined,
    });
  });

  it('computes ages and life status', () => {
    const born = { start: 360 * 10, end: null, precision: 'year' as const };
    expect(ageAt(DEFAULT_CALENDAR, born, 360 * 30 + 100)).toBe(20);
    expect(ageAt(DEFAULT_CALENDAR, born, 0)).toBeNull();
    expect(ageAt(DEFAULT_CALENDAR, null, 100)).toBeNull();
    const died = st(5000);
    expect(lifeStatus(born, died, 100)).toBe('unborn');
    expect(lifeStatus(born, died, 4000)).toBe('alive');
    expect(lifeStatus(born, died, 6000)).toBe('dead');
    expect(lifeStatus(born, null, null)).toBe('alive');
  });

  it('gives life status and age at a point, keeping the age at death', () => {
    const defs = [
      { key: 'born', kind: 'date' },
      { key: 'died', kind: 'date' },
    ];
    const v = { born: st(360 * 10), died: st(360 * 60) };
    expect(lifeAt(DEFAULT_CALENDAR, defs, v, 360 * 5)).toEqual({ status: 'unborn', age: null });
    expect(lifeAt(DEFAULT_CALENDAR, defs, v, 360 * 44)).toEqual({ status: 'alive', age: 34 });
    expect(lifeAt(DEFAULT_CALENDAR, defs, v, 360 * 90)).toEqual({ status: 'dead', age: 50 });
    expect(lifeAt(DEFAULT_CALENDAR, defs, v, null)).toEqual({ status: 'dead', age: 50 });
    expect(lifeAt(DEFAULT_CALENDAR, defs, { born: v.born }, null)).toEqual({
      status: 'alive',
      age: null,
    });
    expect(lifeAt(null, defs, v, 360 * 44)).toEqual({ status: 'alive', age: null });
  });

  it('formats a point at the precision its day implies', () => {
    expect(formatPoint(DEFAULT_CALENDAR, 360 * 11)).toBe('12 E');
    expect(formatPoint(DEFAULT_CALENDAR, 360 * 11 + 30)).toBe('Month 2 12 E');
    expect(formatPoint(DEFAULT_CALENDAR, 360 * 11 + 34)).toMatch(/5/);
    expect(pointPrecision(DEFAULT_CALENDAR, 360 * 11 + 34)).toBe('day');
  });
});
