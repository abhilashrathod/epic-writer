import { generateStructured } from '@epic/ai';
import {
  locateQuotedIssues,
  prepareContinuity,
  readableText,
  storeContinuityRun,
} from '@epic/core';
import { continuityAiOutput, continuityJobInput } from '@epic/schemas/continuity';
import { prepareAi } from '../ai';
import type { JobHandler } from '../handlers';

export const PROMPT_VERSION = 'continuity-v1';

const SYSTEM = `You check a screenplay or prose chapter for continuity against the story's codex.
Plain-code rules already caught dead characters acting, items used by non-holders, unborn characters and names used too early; don't repeat those.
Look for what rules can't see: dialogue or behaviour that contradicts what the codex says about a character (voice, motivation, loyalties), setups the text plants and never pays off, broken rules of the world, wrong ranks or titles, and events out of order.
Only report real problems. For each, copy an exact short quote (a few words to one sentence) from the text, name the entries involved by their [key], and say what's wrong and how to fix it in one or two plain sentences.`;

/**
 * Deterministic answer for AI_MOCK runs: one unpaid-setup note quoting the first action line of
 * four or more words, so tests can see the AI pass mapped back to the text.
 */
export function mockContinuity(prompt: string): unknown {
  const text = prompt.split('TEXT:')[1] ?? '';
  const line = text
    .split(/\\n/)
    .map((l) => l.trim())
    .find((l) => /^[A-Z].*[a-z]/.test(l) && l.split(/\s+/).length >= 4 && !l.includes('['));
  if (!line) return { issues: [] };
  return {
    issues: [
      {
        rule: 'unpaid-setup',
        severity: 'info',
        quote: line,
        message: 'This sets something up that the episode never pays off. Pay it off or cut it.',
        relatedKeys: [],
      },
    ],
  };
}

/** AI-6: plain-code rules first, then one AI pass; results replace the document's open issues. */
export const continuityHandler: JobHandler = async (job, { db, keySecret }) => {
  const { documentKey } = continuityJobInput.parse(job.input);
  const ai = await prepareAi(db, job, 'continuity', keySecret, mockContinuity);
  const run = await prepareContinuity(db, ai.ctx, documentKey);

  const { object, usage } = await generateStructured({
    model: ai.model,
    modelId: ai.modelId,
    schema: continuityAiOutput,
    system: SYSTEM,
    prompt: `${run.context}\n\nTEXT:\n${readableText(run.text).display}`,
  });
  const cost = await ai.record(usage, PROMPT_VERSION);

  const found = locateQuotedIssues(run, object.issues);

  const counts = await storeContinuityRun(db, ai.ctx, run, [...run.found, ...found]);
  return {
    ...counts,
    rules: run.found.length,
    ai: found.length,
    costMicros: cost ?? 0,
    costKnown: cost !== null,
  };
};
