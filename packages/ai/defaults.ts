// Plain data, safe for the browser: import from '@epic/ai/defaults'.

export const PROVIDERS = ['anthropic', 'openai', 'openrouter'] as const;
export type Provider = (typeof PROVIDERS)[number];

export type AiTask = 'extraction' | 'continuity' | 'chat' | 'classification';

/** Suggested models per task; the project's AI settings may override any of them. */
export const DEFAULT_MODELS: Record<Provider, Record<AiTask, string>> = {
  anthropic: {
    extraction: 'claude-opus-5-5',
    continuity: 'claude-opus-5-5',
    chat: 'claude-sonnet-5-5',
    classification: 'claude-haiku-5-5',
  },
  openai: {
    extraction: 'gpt-5',
    continuity: 'gpt-5',
    chat: 'gpt-5-mini',
    classification: 'gpt-5-mini',
  },
  openrouter: {
    extraction: 'anthropic/claude-opus-5-5',
    continuity: 'anthropic/claude-opus-5-5',
    chat: 'anthropic/claude-sonnet-5-5',
    classification: 'anthropic/claude-haiku-5-5',
  },
};
