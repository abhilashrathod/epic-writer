import { describe, expect, it } from 'vitest';
import { generateScript } from './script-fixture';
import { textStats } from './stats';

describe('textStats', () => {
  it('counts visible words only', () => {
    expect(
      textStats('INT. HALL [[@s:k1]]\n\n[[@e:e1|Ganga]] waits. [[note to self]]', 'fountain')
        .wordCount,
    ).toBe(4);
  });

  it('estimates screenplay pages from lines and prose pages from words', () => {
    const script = textStats(generateScript(), 'fountain');
    expect(script.pageCount).toBeGreaterThanOrEqual(50);
    expect(script.pageCount).toBeLessThanOrEqual(60);
    expect(script.estDuration).toBe(Math.round((generateScript().split('\n').length / 55) * 60));
    expect(textStats('word '.repeat(500), 'markdown')).toEqual({
      wordCount: 500,
      pageCount: 2,
      estDuration: 200,
    });
  });

  it('is zero for empty text', () => {
    expect(textStats('  \n', 'fountain')).toEqual({ wordCount: 0, pageCount: 0, estDuration: 0 });
  });
});
