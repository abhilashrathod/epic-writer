import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { languageModel } from './models';
import { costMicros, formatCost } from './pricing';
import { AiOutputError, generateStructured } from './structured';

afterEach(() => vi.unstubAllEnvs());

describe('pricing', () => {
  it('prices known models in micro-dollars, including OpenRouter ids', () => {
    expect(costMicros('claude-opus-5-5', 1000, 500)).toBe(4000 + 10_000);
    expect(costMicros('anthropic/claude-haiku-5-5', 1_000_000, 0)).toBe(100_000);
    expect(costMicros('some-unknown-model', 10, 10)).toBeNull();
    expect(formatCost(14_000)).toBe('$0.01');
    expect(formatCost(1234)).toBe('$0.0012');
    expect(formatCost(null)).toBe('cost unknown for this model');
  });
});

describe('generateStructured with the mock model', () => {
  const schema = z.object({ names: z.array(z.string()) });

  it('returns validated output and counts usage', async () => {
    vi.stubEnv('AI_MOCK', '1');
    const { model, modelId } = languageModel('anthropic', 'claude-opus-5-5', 'unused', () => ({
      names: ['Bhishma'],
    }));
    const r = await generateStructured({ model, modelId, schema, system: 's', prompt: 'p' });
    expect(r.object).toEqual({ names: ['Bhishma'] });
    expect(r.usage.tokensIn).toBeGreaterThan(0);
    expect(r.usage.costMicros).not.toBeNull();
  });

  it('retries once with the errors, then fails visibly', async () => {
    vi.stubEnv('AI_MOCK', '1');
    const prompts: string[] = [];
    const flaky = languageModel('anthropic', 'x', 'unused', (p) => {
      prompts.push(p);
      return prompts.length === 1 ? { names: 'nope' } : { names: ['ok'] };
    });
    expect(
      (await generateStructured({ ...flaky, schema, system: 's', prompt: 'p' })).object,
    ).toEqual({ names: ['ok'] });
    expect(prompts[1]).toContain('previous answer was invalid');

    const bad = languageModel('anthropic', 'x', 'unused', () => ({ wrong: true }));
    await expect(
      generateStructured({ ...bad, schema, system: 's', prompt: 'p' }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });

  it('refuses mock mode in production', () => {
    vi.stubEnv('AI_MOCK', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(languageModel('anthropic', 'claude-opus-5-5', 'k').modelId).toBe('claude-opus-5-5');
  });
});
