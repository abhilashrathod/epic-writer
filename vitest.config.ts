import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
    env: {
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://localhost:27018/?replicaSet=rs0',
    },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
