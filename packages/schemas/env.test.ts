import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv, mongoEnvSchema, workerEnvSchema } from './env';

describe('loadEnv', () => {
  it('returns parsed values', () => {
    const env = loadEnv(mongoEnvSchema, { MONGODB_URI: 'mongodb://x', MONGODB_DB: 'd' });
    expect(env.MONGODB_DB).toBe('d');
  });

  it('lists every invalid variable', () => {
    const bad = () =>
      loadEnv(workerEnvSchema, { MONGODB_URI: 'http://x', KEY_ENCRYPTION_SECRET: 'abc' });
    expect(bad).toThrow(EnvError);
    expect(bad).toThrow(/MONGODB_URI[\s\S]*MONGODB_DB[\s\S]*KEY_ENCRYPTION_SECRET[\s\S]*WORKER_ID/);
  });

  it('accepts an absolute BACKUP_DIR, treats blank as unset and rejects relative paths', () => {
    const base = {
      MONGODB_URI: 'mongodb://x',
      MONGODB_DB: 'd',
      KEY_ENCRYPTION_SECRET: Buffer.alloc(32).toString('base64'),
      WORKER_ID: 'w',
    };
    expect(loadEnv(workerEnvSchema, { ...base, BACKUP_DIR: '/srv/backups' }).BACKUP_DIR).toBe(
      '/srv/backups',
    );
    expect(loadEnv(workerEnvSchema, { ...base, BACKUP_DIR: '' }).BACKUP_DIR).toBeUndefined();
    expect(() => loadEnv(workerEnvSchema, { ...base, BACKUP_DIR: 'backups' })).toThrow(
      /BACKUP_DIR/,
    );
  });
});
