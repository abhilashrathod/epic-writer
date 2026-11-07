import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// One .env at the repo root serves web and worker. Existing env vars win over the file.
const rootEnv = join(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  transpilePackages: ['@epic/core', '@epic/db', '@epic/schemas', '@epic/ui'],
};

export default config;
