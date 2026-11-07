import { describe, expect, it } from 'vitest';
import { assignSceneKeys, extractScenes } from './scenes';

const keys = () => {
  let i = 0;
  return () => `key-${++i}`;
};

describe('extractScenes (fountain)', () => {
  const script = 'Cold open.\n\nINT. HALL - DAY [[@s:a]]\n\nTalk.\n\nEXT. FIELD - NIGHT\n\nWar.';

  it('returns each heading with its key and range', () => {
    const scenes = extractScenes(script, 'fountain');
    expect(scenes.map((s) => [s.key, s.heading, s.line])).toEqual([
      ['a', 'INT. HALL - DAY', 2],
      [null, 'EXT. FIELD - NIGHT', 6],
    ]);
    expect(script.slice(scenes[0]!.from, scenes[0]!.to)).toBe(
      'INT. HALL - DAY [[@s:a]]\n\nTalk.\n\n',
    );
    expect(scenes[1]!.to).toBe(script.length);
  });

  it('strips the force dot from headings', () => {
    expect(extractScenes('.FLASHBACK', 'fountain')[0]?.heading).toBe('FLASHBACK');
  });
});

describe('extractScenes (markdown)', () => {
  it('splits on *** and skips empty stretches', () => {
    const text = '\n# Chapter One <!-- s:a -->\nIt began.\n\n***\n\nLater.\n* * *\n\n';
    const scenes = extractScenes(text, 'markdown');
    expect(scenes.map((s) => [s.key, s.heading])).toEqual([
      ['a', 'Chapter One'],
      [null, 'Later.'],
    ]);
    expect(text.slice(scenes[0]!.from, scenes[0]!.to)).toBe(
      '# Chapter One <!-- s:a -->\nIt began.\n\n',
    );
  });
});

describe('assignSceneKeys', () => {
  it('adds keys to unmarked scenes and leaves marked ones', () => {
    const out = assignSceneKeys('INT. A [[@s:a]]\n\nx\n\nINT. B\n\ny', 'fountain', keys());
    expect(out).toBe('INT. A [[@s:a]]\n\nx\n\nINT. B [[@s:key-1]]\n\ny');
  });

  it('replaces a duplicated key on the later scene', () => {
    const out = assignSceneKeys('INT. A [[@s:a]]\n\nINT. A COPY [[@s:a]]', 'fountain', keys());
    expect(out).toBe('INT. A [[@s:a]]\n\nINT. A COPY [[@s:key-1]]');
  });

  it('marks markdown scenes with comments', () => {
    expect(assignSceneKeys('One.\n***\nTwo.', 'markdown', keys())).toBe(
      'One. <!-- s:key-1 -->\n***\nTwo. <!-- s:key-2 -->',
    );
  });

  it('returns the same string when nothing changes', () => {
    const text = 'INT. A [[@s:a]]';
    expect(assignSceneKeys(text, 'fountain', keys())).toBe(text);
  });
});
