/**
 * Prices in micro-dollars per token, which is the same number as dollars per million tokens.
 * Only models with a known price are listed; others run with cost reported as unknown.
 * Source: Anthropic's published API prices (Claude API reference, cached 2026-10-06).
 */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  mock: { input: 1, output: 2 },
};

/** Cost of one call in whole micro-dollars, or null when the model's price is unknown. */
export function costMicros(modelId: string, tokensIn: number, tokensOut: number): number | null {
  // OpenRouter ids look like "anthropic/claude-opus-5-5"; price them by the bare model.
  const p = PRICES[modelId] ?? PRICES[modelId.split('/').pop() ?? ''];
  return p ? Math.round(tokensIn * p.input + tokensOut * p.output) : null;
}

/** "$0.0123" style, for showing the cost after a run. */
export function formatCost(micros: number | null): string {
  if (micros === null) return 'cost unknown for this model';
  return `$${(micros / 1_000_000).toFixed(micros < 10_000 ? 4 : 2)}`;
}
