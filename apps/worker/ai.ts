import { ObjectId, type Db } from 'mongodb';
import {
  createEmbedder,
  DEFAULT_MODELS,
  languageModel,
  type AiTask,
  type MockResponder,
  type Provider,
  type RunUsage,
} from '@epic/ai';
import {
  decryptAiKey,
  Forbidden,
  Invalid,
  openProject,
  relevantLongFields,
  type ChunkableEntity,
  type ChunkableType,
  type ProjectContext,
} from '@epic/core';
import { logger } from '@epic/schemas/logger';
import { aiUsage, projects, users, type JobDoc } from '@epic/db';

const USAGE_TASK: Record<AiTask, 'extraction' | 'continuity' | 'chat'> = {
  extraction: 'extraction',
  continuity: 'continuity',
  chat: 'chat',
  classification: 'extraction',
};

/** Null (unknown) wins: a total with an unknown part is unknown. */
export const addCosts = (a: number | null, b: number | null) =>
  a === null || b === null ? null : a + b;

/**
 * Everything an AI handler needs for one job: the project context, the model chosen in the
 * project's AI settings (or the provider's suggested one), and `record` to log usage and cost
 * (AI-10). Only the worker decrypts keys or calls providers (AGENTS.md rule 6).
 */
export async function prepareAi(
  db: Db,
  job: JobDoc,
  task: AiTask,
  keySecret: string,
  mock: MockResponder,
) {
  const project = await projects.findById(db, job.projectId);
  if (!project) throw new Invalid('Project not found');
  const owner = await users.findById(db, project.ownerId);
  const ctx: ProjectContext = await openProject(db, project._id, project.ownerId);
  const provider = (project.aiSettings.provider || 'anthropic') as Provider;
  const apiKey = owner ? decryptAiKey(owner, provider, keySecret) : null;
  if (!apiKey) throw new Forbidden(`No ${provider} API key is saved. Add one in Settings.`);
  const chosen = project.aiSettings.models[task] || DEFAULT_MODELS[provider][task];
  const { model, modelId } = languageModel(provider, chosen, apiKey, mock);

  const cheap = languageModel(
    provider,
    project.aiSettings.models.classification || DEFAULT_MODELS[provider].classification,
    apiKey,
    mock,
  );
  const embedder = createEmbedder(
    owner ? decryptAiKey(owner, 'openai', keySecret) : null,
    project.aiSettings.models.embedding || undefined,
  );

  async function record(
    usage: RunUsage,
    promptVersion: string,
    detail: { pass?: 'mentions' | 'fields'; promptChars?: number; modelId?: string } = {},
  ): Promise<number | null> {
    await aiUsage.record(db, {
      projectId: project!._id,
      jobId: new ObjectId(job._id),
      task: USAGE_TASK[task],
      provider,
      model: detail.modelId ?? modelId,
      promptVersion,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costMicros: usage.costMicros ?? 0,
      ...(detail.pass ? { pass: detail.pass } : {}),
      ...(detail.promptChars !== undefined ? { promptChars: detail.promptChars } : {}),
      at: new Date(),
    });
    return usage.costMicros;
  }

  /** Long fields most relevant to `query`. If embedding fails, ranks by keywords instead. */
  async function relevantFields(
    query: string,
    entities: ChunkableEntity[],
    types: ChunkableType[],
    only?: Set<string>,
    skipFields?: Set<string>,
  ): Promise<{ fields: string[]; costMicros: number | null }> {
    const input = {
      entities,
      types,
      ...(only ? { only } : {}),
      ...(skipFields ? { skipFields } : {}),
    };
    const res = await relevantLongFields(db, ctx, embedder, query, input).catch((e: unknown) => {
      logger.warn('embedding failed; ranking by keywords', { error: String(e) });
      return relevantLongFields(db, ctx, null, query, input);
    });
    if (res.tokens && embedder)
      await aiUsage.record(db, {
        projectId: project!._id,
        jobId: new ObjectId(job._id),
        task: 'embedding',
        provider: 'openai',
        model: embedder.modelId,
        promptVersion: 'embed-1',
        tokensIn: res.tokens,
        tokensOut: 0,
        costMicros: res.costMicros ?? 0,
        at: new Date(),
      });
    return res;
  }

  return { ctx, model, modelId, provider, cheap, record, relevantFields };
}
