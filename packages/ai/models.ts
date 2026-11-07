import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import type { Provider } from './defaults';

export * from './defaults';

/** Tests and e2e runs answer with a deterministic local model instead of a provider. Never in production. */
export function mockEnabled(): boolean {
  return process.env.AI_MOCK === '1' && process.env.NODE_ENV !== 'production';
}

/** Turns a prompt into the JSON a mock run returns. Each task supplies its own. */
export type MockResponder = (prompt: string) => unknown;

function mockModel(respond: MockResponder): LanguageModel {
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'mock',
    doGenerate: async (options) => {
      const prompt = JSON.stringify(options.prompt);
      const text = JSON.stringify(respond(prompt));
      const input = Math.ceil(prompt.length / 4);
      const output = Math.ceil(text.length / 4);
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: output, text: output, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}

/** The model to call. With AI_MOCK=1 outside production, every provider answers from `mock`. */
export function languageModel(
  provider: Provider,
  modelId: string,
  apiKey: string,
  mock?: MockResponder,
): { model: LanguageModel; modelId: string } {
  if (mockEnabled()) {
    if (!mock) throw new Error('This task has no mock responder for AI_MOCK runs');
    return { model: mockModel(mock), modelId: 'mock' };
  }
  switch (provider) {
    case 'anthropic':
      return { model: createAnthropic({ apiKey })(modelId), modelId };
    case 'openai':
      return { model: createOpenAI({ apiKey })(modelId), modelId };
    case 'openrouter':
      return { model: createOpenRouter({ apiKey }).chat(modelId), modelId };
  }
}
