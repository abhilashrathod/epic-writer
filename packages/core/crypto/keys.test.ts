import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Invalid } from '../errors';
import { decryptKey, encryptKey } from './keys';

const secret = randomBytes(32).toString('base64');

describe('encryptKey / decryptKey', () => {
  it('round-trips and keeps the last 4 characters', () => {
    const rec = encryptKey('sk-ant-secret-1234', secret);
    expect(rec.last4).toBe('1234');
    expect(rec.encryptedKey).not.toContain('secret');
    expect(decryptKey(rec, secret)).toBe('sk-ant-secret-1234');
  });

  it('uses a fresh iv each time', () => {
    expect(encryptKey('k', secret).iv).not.toBe(encryptKey('k', secret).iv);
  });

  it('fails on a tampered tag', () => {
    const rec = encryptKey('sk-ant-secret-1234', secret);
    const tag = Buffer.from(rec.tag, 'base64');
    tag[0] = (tag[0] ?? 0) ^ 0xff;
    expect(() => decryptKey({ ...rec, tag: tag.toString('base64') }, secret)).toThrow();
  });

  it('fails with the wrong secret', () => {
    const rec = encryptKey('k', secret);
    expect(() => decryptKey(rec, randomBytes(32).toString('base64'))).toThrow();
  });

  it('rejects a secret that is not 32 bytes', () => {
    expect(() => encryptKey('k', Buffer.from('short').toString('base64'))).toThrow(Invalid);
  });
});
