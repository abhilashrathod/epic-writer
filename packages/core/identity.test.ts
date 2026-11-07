import { describe, expect, it } from 'vitest';
import { matchCandidates, nameScore, normaliseName, STRONG_MATCH, WEAK_MATCH } from './identity';

describe('identity resolution', () => {
  it('normalises case, accents, punctuation and a leading article', () => {
    expect(normaliseName('  The Kíngslayer! ')).toBe('kingslayer');
    expect(normaliseName('Jaime  Lannister')).toBe('jaime lannister');
  });

  it('scores equal names 1, contained names 0.8 and near spellings by edit distance', () => {
    expect(nameScore('ARJUNA', 'Arjuna')).toBe(1);
    expect(nameScore('Jaime', 'Jaime Lannister')).toBe(0.8);
    expect(nameScore('Arjun', 'Arjuna')).toBeCloseTo(0.83, 2);
    expect(nameScore('Karna', 'Bhishma')).toBeLessThan(WEAK_MATCH);
    expect(nameScore('', 'Arjuna')).toBe(0);
  });

  it('ranks candidates by their closest name or alias and drops weak ones', () => {
    const entries = [
      { key: 'a', name: 'Arjuna', aliases: ['Partha'] },
      { key: 'b', name: 'Karna', aliases: [] },
      { key: 'c', name: 'Arjuna Pandava', aliases: [] },
    ];
    expect(matchCandidates(['Partha'], entries)).toEqual([{ key: 'a', score: 1 }]);
    const arjun = matchCandidates(['Arjun'], entries);
    expect(arjun[0]).toEqual({ key: 'a', score: 0.83 });
    expect(arjun[0]!.score).toBeLessThan(STRONG_MATCH);
    expect(matchCandidates(['Duryodhana'], entries)).toEqual([]);
    expect(matchCandidates(['Arjuna'], entries, 1)).toEqual([{ key: 'a', score: 1 }]);
  });
});
