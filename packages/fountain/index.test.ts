import { describe, expect, it } from 'vitest';
import { version } from './index';

describe('placeholder', () => {
  it('exports a version', () => {
    expect(version).toBe('0.0.0');
  });
});
