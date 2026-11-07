import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root serves web and worker. Existing env vars win over the file.
const rootEnv = join(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Turbopack's on-disk dev cache went stale when code changed between dev runs, which made pages
  // reload in an endless loop ("HMR hash mismatch"). A slower first compile is the better trade.
  experimental: { turbopackFileSystemCacheForDev: false },
  transpilePackages: ['@epic/core', '@epic/db', '@epic/fountain', '@epic/schemas', '@epic/ui'],
};

export default config;
