import { generateStructured, type MockResponder } from '@epic/ai';
import {
  buildCodexContext,
  formatPoint,
  Invalid,
  listEntityTypes,
  listLinkTypes,
  mentions,
  worldSnapshot,
} from '@epic/core';
import { readHeadByKey } from '@epic/db';
import { askInput, askOutput, type AskResultDto } from '@epic/schemas/ai-ask';
import { prepareAi } from '../ai';
import type { JobHandler } from '../handlers';

export const PROMPT_VERSION = 'ask-v1';

const SYSTEM = `You answer an author's questions about their story world, using only the codex cards given.
Each card starts with its key in square brackets. The cards show the world as of POINT; nothing later is known, so never guess at what comes after.
Rules:
- Answer only from the cards. Don't invent names, dates or events.
- Put the key of every card you used in citedKeys.
- If the cards don't answer the question, say plainly that the codex doesn't say, and set unknown to true.
- Keep the answer short and direct.`;

/** Mock runs answer from the first card named in the question, citing it. */
export const mockAsk: MockResponder = (prompt) => {
  const question = prompt.slice(prompt.lastIndexOf('Question: '));
  for (const [, key, name] of prompt.matchAll(/\\n\\n\[([^\]]+)\] (.+?) \(/g)) {
    if (mentions(question, name!))
      return { answer: `The codex has a card for ${name}.`, citedKeys: [key], unknown: false };
  }
  return { answer: 'The codex doesn’t say.', citedKeys: [], unknown: true };
};

/** AI-8: answers a question from the codex as of a point, citing the cards it used. */
export function makeAskHandler(mock: MockResponder = mockAsk): JobHandler {
  return async (job, { db, keySecret }) => {
    const parsed = askInput.safeParse(job.input);
    if (!parsed.success) throw new Invalid('The question is missing or too long');
    const { question, asOf } = parsed.data;
    const ai = await prepareAi(db, job, 'chat', keySecret, mock);
    const { ctx } = ai;
    const [world, types, linkTypes, calendar] = await Promise.all([
      worldSnapshot(db, ctx),
      listEntityTypes(db, ctx),
      listLinkTypes(db, ctx),
      readHeadByKey(db, 'calendars', ctx.scope, ctx.project.defaultCalendarKey),
    ]);
    const cards = buildCodexContext(
      { ...world, types, linkTypes, calendar, units: ctx.project.units },
      asOf,
      question,
    );
    if (cards.length === 0) {
      const empty: AskResultDto = {
        answer: 'The codex has no entries yet, so there is nothing to answer from.',
        citedKeys: [],
        unknown: true,
        costMicros: 0,
        costKnown: true,
      };
      return { ...empty };
    }

    const point =
      asOf.storyTime === null
        ? 'the end of the story'
        : calendar
          ? formatPoint(calendar, asOf.storyTime)
          : `day ${asOf.storyTime}`;
    const { object, usage } = await generateStructured({
      model: ai.model,
      modelId: ai.modelId,
      schema: askOutput,
      system: SYSTEM.replace('POINT', point),
      prompt: `Codex cards (the only things known):\n\n${cards.map((c) => c.text).join('\n\n')}\n\nQuestion: ${question}`,
    });
    const costMicros = await ai.record(usage, PROMPT_VERSION);
    const known = new Set(cards.map((c) => c.key));
    const result: AskResultDto = {
      answer: object.answer,
      citedKeys: [...new Set(object.citedKeys)].filter((k) => known.has(k)),
      unknown: object.unknown,
      costMicros,
      costKnown: costMicros !== null,
    };
    return { ...result };
  };
}

export const ask = makeAskHandler();
