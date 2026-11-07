import { describe, expect, it } from 'vitest';
import { Conflict, DomainError, Forbidden, Invalid, NotFound } from './errors';

describe('DomainError', () => {
  it.each([
    [NotFound, 'not_found'],
    [Conflict, 'conflict'],
    [Invalid, 'invalid'],
    [Forbidden, 'forbidden'],
  ] as const)('%o carries its code', (Cls, code) => {
    const e = new Cls('msg');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe(code);
    expect(e.message).toBe('msg');
  });
});
