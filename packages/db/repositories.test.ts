import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from 'mongodb';
import { col } from './client';
import { users } from './repositories';
import { createTestDb } from './testing';

let db: Db;
let drop: () => Promise<void>;
beforeAll(async () => ({ db, drop } = await createTestDb()));
afterAll(() => drop());

describe('users.upsertFromGithub', () => {
  it('survives concurrent first sign-ins for the same login', async () => {
    for (let round = 0; round < 20; round++) {
      const p = { githubLogin: `race-${round}`, email: `race-${round}@example.test`, name: 'Race' };
      const results = await Promise.all(
        Array.from({ length: 20 }, () => users.upsertFromGithub(db, p)),
      );
      expect(new Set(results.map((u) => u._id.toHexString())).size).toBe(1);
      expect(await col(db, 'users').countDocuments({ githubLogin: p.githubLogin })).toBe(1);
    }
  });
});
