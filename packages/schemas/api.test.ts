import { describe, expect, it } from 'vitest';
import { createProjectBody, preferencesBody } from './api';

describe('createProjectBody', () => {
  it('trims the name and rejects blanks', () => {
    expect(createProjectBody.parse({ name: '  Test World ' }).name).toBe('Test World');
    expect(createProjectBody.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('preferencesBody', () => {
  it('accepts a skin or a theme, and rejects empty or unknown values', () => {
    expect(preferencesBody.safeParse({ skin: 'sand' }).success).toBe(true);
    expect(preferencesBody.safeParse({ theme: 'system' }).success).toBe(true);
    expect(preferencesBody.safeParse({}).success).toBe(false);
    expect(preferencesBody.safeParse({ skin: 'neon' }).success).toBe(false);
  });
});
