import type { Metadata } from 'next';
import { Courier_Prime, Inter_Tight } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '../components/Providers';
import { currentUser } from '../lib/session';
import './globals.css';

const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-inter-tight' });
const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-courier-prime',
});

export const metadata: Metadata = { title: 'Epic Writer' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Rendering the saved skin and theme on the server avoids a flash of the default look.
  const prefs = (await currentUser())?.preferences;
  return (
    <html
      lang="en"
      data-skin={prefs?.skin ?? 'ink'}
      data-theme={prefs?.theme ?? 'system'}
      className={`${interTight.variable} ${courierPrime.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
