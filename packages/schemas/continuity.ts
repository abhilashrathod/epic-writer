import { z } from 'zod';

const key = z.string().min(1).max(64);

/** Input of a `continuity` job (AI-6). */
export const continuityJobInput = z.object({ documentKey: key });

/** Rules the AI pass may report: what plain-code rules can't see. */
export const AI_CONTINUITY_RULES = [
  'contradicts-canon',
  'knowledge-leak',
  'unpaid-setup',
  'rule-violation',
  'rank-mismatch',
  'timeline-clash',
] as const;

/** The AI pass's answer. Quotes are copied from the text so issues can be underlined. */
export const continuityAiOutput = z.object({
  issues: z
    .array(
      z.object({
        rule: z.enum(AI_CONTINUITY_RULES),
        severity: z.enum(['info', 'warning', 'error']),
        quote: z.string().min(1).max(400),
        message: z.string().min(1).max(600),
        relatedKeys: z.array(key).max(10),
      }),
    )
    .max(30),
});

export interface ContinuityIssueDto {
  id: string;
  rule: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  relatedKeys: string[];
  sceneKey: string | null;
  range: { from: number; to: number } | null;
  /** The flagged text in the saved working text, so the editor can check it still matches. */
  quote: string;
  status: 'open' | 'dismissed' | 'fixed' | 'stale';
}
