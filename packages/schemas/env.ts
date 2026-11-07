import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    'must be exactly 32 bytes, base64-encoded',
  );

export const mongoEnvSchema = z.object({
  MONGODB_URI: z.string().startsWith('mongodb', 'must be a mongodb:// or mongodb+srv:// URI'),
  MONGODB_DB: z.string().min(1),
});

export const workerEnvSchema = mongoEnvSchema.extend({
  KEY_ENCRYPTION_SECRET: base64Key32,
  WORKER_ID: z.string().min(1),
});

export const webEnvSchema = mongoEnvSchema.extend({
  AUTH_SECRET: z.string().min(32),
  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),
  ALLOWED_GITHUB_LOGIN: z.string().min(1),
  KEY_ENCRYPTION_SECRET: base64Key32,
});

export type MongoEnv = z.infer<typeof mongoEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type WebEnv = z.infer<typeof webEnvSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/** Parses env vars against a schema; throws one readable error listing every bad variable. */
export function loadEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
  throw new EnvError(`Invalid environment variables:\n${lines.join('\n')}\nSee .env.example.`);
}
