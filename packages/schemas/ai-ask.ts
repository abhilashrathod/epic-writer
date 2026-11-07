import { z } from 'zod';

/** Input of an `ask` job (AI-8): a question answered from the codex as of a point. */
export const askInput = z.object({
  question: z.string().trim().min(1, 'Type a question').max(2_000),
  asOf: z
    .object({
      storyTime: z.number().int().nullable(),
      workKey: z.string().min(1).nullable(),
      order: z.string().min(1).nullable(),
    })
    .default({ storyTime: null, workKey: null, order: null }),
});

/** What the model must return for an `ask` job; `citedKeys` are the cards it used. */
export const askOutput = z.object({
  answer: z.string().max(10_000),
  citedKeys: z.array(z.string()).max(50),
  unknown: z.boolean(),
});

/** Output of a finished `ask` job, as the browser reads it. */
export interface AskResultDto extends z.infer<typeof askOutput> {
  costMicros: number | null;
  costKnown: boolean;
}
