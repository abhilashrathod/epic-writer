import { generateObject, NoObjectGeneratedError, type LanguageModel } from 'ai';
import type { z } from 'zod';
import { costMicros } from './pricing';

export interface RunUsage {
  tokensIn: number;
  tokensOut: number;
  /** Null when the model's price is unknown. */
  costMicros: number | null;
}

export class AiOutputError extends Error {
  override name = 'AiOutputError';
}

const reason = (err: Error) => (err.cause instanceof Error ? err.cause.message : err.message);

/**
 * One structured call (AGENTS.md rule 8): output is validated against `schema`; if it doesn't
 * validate, the call is retried once with the errors; a second failure throws AiOutputError.
 * Usage from both attempts is counted.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  model: LanguageModel;
  modelId: string;
  schema: S;
  system: string;
  prompt: string;
}): Promise<{ object: z.infer<S>; usage: RunUsage }> {
  let tokensIn = 0;
  let tokensOut = 0;
  let prompt = opts.prompt;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await generateObject({
        model: opts.model,
        schema: opts.schema,
        system: opts.system,
        prompt,
      });
      tokensIn += res.usage.inputTokens ?? 0;
      tokensOut += res.usage.outputTokens ?? 0;
      return {
        object: res.object as z.infer<S>,
        usage: { tokensIn, tokensOut, costMicros: costMicros(opts.modelId, tokensIn, tokensOut) },
      };
    } catch (err) {
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
      tokensIn += err.usage?.inputTokens ?? 0;
      tokensOut += err.usage?.outputTokens ?? 0;
      if (attempt === 2)
        throw new AiOutputError(
          `The model's answer didn't match the expected format twice: ${reason(err)}`,
        );
      prompt = `${opts.prompt}\n\nYour previous answer was invalid: ${reason(err)}\nAnswer again, following the schema exactly.`;
    }
  }
}
