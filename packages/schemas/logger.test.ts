import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes info as one JSON line to stdout', () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    logger.info('hello', { a: 1 });
    expect(JSON.parse(String(out.mock.calls[0]?.[0]))).toMatchObject({
      level: 'info',
      msg: 'hello',
      a: 1,
    });
  });

  it('writes errors to stderr', () => {
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    logger.error('boom');
    expect(String(err.mock.calls[0]?.[0])).toContain('"level":"error"');
  });
});
