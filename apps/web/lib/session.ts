import { ObjectId } from 'mongodb';
import { connection } from 'next/server';
import { users, type UserDoc } from '@epic/db';
import { auth } from '../auth';
import { getAppDb, isE2eBypass } from './server';

const E2E_USER = { githubLogin: 'e2e-user', email: 'e2e-user@example.test', name: 'E2E User' };

/** The signed-in user's row, or null. */
export async function currentUser(): Promise<UserDoc | null> {
  // Per-request data: tells Next not to prerender callers at build time.
  await connection();
  const db = getAppDb();
  if (isE2eBypass()) return users.upsertFromGithub(db, E2E_USER);
  const id = (await auth())?.user?.id;
  if (!id || !ObjectId.isValid(id)) return null;
  return users.findById(db, new ObjectId(id));
}
