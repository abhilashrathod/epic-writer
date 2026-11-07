import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { users } from '@epic/db';
import { getAppDb, getEnv } from './lib/server';

// Auth.js reads AUTH_SECRET, AUTH_GITHUB_ID and AUTH_GITHUB_SECRET from the environment at request
// time; getEnv() validates them (and the rest) on first use, so `next build` needs no secrets.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: 'jwt' },
  pages: { signIn: '/signin', error: '/signin' },
  callbacks: {
    // Single-user app: only the allowlisted GitHub login gets in.
    signIn: ({ profile }) => profile?.login === getEnv().ALLOWED_GITHUB_LOGIN,
    async jwt({ token, profile }) {
      if (profile && typeof profile.login === 'string') {
        const login = profile.login;
        const user = await users.upsertFromGithub(getAppDb(), {
          githubLogin: login,
          email: profile.email ?? `${login}@users.noreply.github.com`,
          name: profile.name ?? login,
        });
        token.userId = user._id.toHexString();
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === 'string') session.user.id = token.userId;
      return session;
    },
  },
});
