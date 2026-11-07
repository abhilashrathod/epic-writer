import type { Db, ObjectId } from 'mongodb';
import { aiUsage, jobs, projectSettings, users, type JobDoc, type UserDoc } from '@epic/db';
import {
  aiKeyInput,
  aiSettingsInput,
  type AI_JOB_TYPES,
  type AiKeyDto,
  type AiSettingsDto,
} from '@epic/schemas/api';
import { decryptKey, encryptKey } from './crypto/keys';
import { Forbidden, Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

type Provider = AiKeyDto['provider'];

/** What the browser may see of a key (AI-2): never the key itself. */
export const aiKeySummaries = (user: UserDoc): AiKeyDto[] =>
  user.aiKeys.map((k) => ({ provider: k.provider as Provider, label: k.label, last4: k.last4 }));

/** Stores a key encrypted at rest; one key per provider, so saving again replaces it. */
export async function saveAiKey(
  db: Db,
  user: UserDoc,
  raw: unknown,
  secret: string,
): Promise<AiKeyDto[]> {
  const input = aiKeyInput.parse(raw);
  const enc = encryptKey(input.key, secret);
  const next = [
    ...user.aiKeys.filter((k) => k.provider !== input.provider),
    { provider: input.provider, label: input.label, ...enc },
  ];
  await users.setAiKeys(db, user._id, next);
  return aiKeySummaries({ ...user, aiKeys: next });
}

export async function deleteAiKey(db: Db, user: UserDoc, provider: string): Promise<void> {
  if (!user.aiKeys.some((k) => k.provider === provider))
    throw new NotFound('No key saved for that provider');
  await users.setAiKeys(
    db,
    user._id,
    user.aiKeys.filter((k) => k.provider !== provider),
  );
}

/** The plain key for a provider, for the worker only. Null when none is saved. */
export function decryptAiKey(user: UserDoc, provider: string, secret: string): string | null {
  const k = user.aiKeys.find((x) => x.provider === provider);
  return k ? decryptKey(k, secret) : null;
}

const monthStart = (now = new Date()) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function getAiSettings(db: Db, ctx: ProjectContext): Promise<AiSettingsDto> {
  const owner = await users.findById(db, ctx.project.ownerId);
  const s = ctx.project.aiSettings;
  const spend = await aiUsage.spend(db, ctx.project._id, monthStart());
  return {
    provider: (s.provider || 'anthropic') as Provider,
    models: s.models,
    monthlyCapMicros: s.monthlyCapMicros,
    keyProviders: (owner?.aiKeys ?? []).map((k) => k.provider as Provider),
    spend: { monthTotal: spend.total, byTask: spend.byTask },
  };
}

export async function updateAiSettings(db: Db, ctx: ProjectContext, raw: unknown): Promise<void> {
  const input = aiSettingsInput.parse(raw);
  // AI never runs on its own (AGENTS.md): autoRun stays false.
  await projectSettings.setAiSettings(db, ctx.project._id, { ...input, autoRun: false });
}

/**
 * Queues an AI job after checking it can run: the project owner has a key for the project's
 * provider, and the monthly cap (AI-10) isn't spent. The worker does the rest.
 */
export async function enqueueAiJob(
  db: Db,
  ctx: ProjectContext,
  type: (typeof AI_JOB_TYPES)[number],
  input: Record<string, unknown>,
): Promise<JobDoc> {
  const settings = await getAiSettings(db, ctx);
  if (!settings.keyProviders.includes(settings.provider)) {
    throw new Invalid(`Add your ${settings.provider} API key in Settings before running AI.`);
  }
  if (settings.monthlyCapMicros > 0 && settings.spend.monthTotal >= settings.monthlyCapMicros) {
    throw new Forbidden(
      'This project has reached its monthly AI spending cap. Raise the cap in AI settings to continue.',
    );
  }
  return jobs.enqueue(db, { ...ctx.scope, type, input });
}

export async function getJob(db: Db, ctx: ProjectContext, jobId: ObjectId): Promise<JobDoc> {
  const job = await jobs.findInProject(db, ctx.project._id, jobId);
  if (!job) throw new NotFound('Job not found');
  return job;
}
