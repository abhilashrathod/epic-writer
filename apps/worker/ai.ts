import { ObjectId, type Db } from 'mongodb';
import {
  DEFAULT_MODELS,
  languageModel,
  type AiTask,
  type MockResponder,
  type Provider,
  type RunUsage,
} from '@epic/ai';
import { decryptAiKey, Forbidden, Invalid, openProject, type ProjectContext } from '@epic/core';
import { aiUsage, projects, users, type JobDoc } from '@epic/db';

const USAGE_TASK: Record<AiTask, 'extraction' | 'continuity' | 'chat'> = {
  extraction: 'extraction',
  continuity: 'continuity',
  chat: 'chat',
};

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

  async function record(usage: RunUsage, promptVersion: string): Promise<number | null> {
    await aiUsage.record(db, {
      projectId: project!._id,
      jobId: new ObjectId(job._id),
      task: USAGE_TASK[task],
      provider,
      model: modelId,
      promptVersion,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costMicros: usage.costMicros ?? 0,
      at: new Date(),
    });
    return usage.costMicros;
  }

  return { ctx, model, modelId, provider, record };
}
