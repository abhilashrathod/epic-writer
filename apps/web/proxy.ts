import { NextResponse } from 'next/server';
import { auth } from './auth';
import { isE2eBypass } from './lib/server';

const withAuth = auth((req) => {
  if (req.auth?.user || isE2eBypass()) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/signin', req.nextUrl));
});

// Next only detects a function declaration (or default export) named `proxy`.
export function proxy(...args: Parameters<typeof withAuth>) {
  return withAuth(...args);
}

// Everything is protected except sign-in, the auth callbacks, health and static assets.
export const config = {
  matcher: ['/((?!signin|api/auth|api/health|_next/static|_next/image|favicon.ico).*)'],
};
