import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Invalid } from '../errors';

export interface EncryptedKey {
  encryptedKey: string;
  iv: string;
  tag: string;
  last4: string;
}

function secretBytes(secretB64: string): Buffer {
  const key = Buffer.from(secretB64, 'base64');
  if (key.length !== 32) throw new Invalid('KEY_ENCRYPTION_SECRET must be 32 bytes, base64');
  return key;
}

/** Encrypts an AI provider key with AES-256-GCM. `secretB64` is KEY_ENCRYPTION_SECRET. */
export function encryptKey(plain: string, secretB64: string): EncryptedKey {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretBytes(secretB64), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return {
    encryptedKey: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    last4: plain.slice(-4),
  };
}

/** Decrypts a stored key. Throws if the ciphertext, iv or tag was tampered with. */
export function decryptKey(record: Omit<EncryptedKey, 'last4'>, secretB64: string): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    secretBytes(secretB64),
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedKey, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
