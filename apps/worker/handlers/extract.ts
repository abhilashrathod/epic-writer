import { generateStructured, type MockResponder } from '@epic/ai';
import {
  extractionCodex,
  extractionScope,
  extractionSource,
  Invalid,
  proposalChanges,
  saveProposal,
  type ExtractionCodex,
  type ExtractionSource,
} from '@epic/core';
import { fieldAi } from '@epic/schemas';
import {
  extractionOutput,
  extractJobInput,
  mentionOutput,
  type ExtractionOutput,
} from '@epic/schemas/proposals';
import { addCosts, prepareAi } from '../ai';
import type { JobHandler } from '../handlers';

export const PROMPT_VERSION = 'extract-3';

const MENTION_SYSTEM = `You list what a writer's text names: characters, places, groups, objects and events.
Task: mentions.
Rules:
- Give each distinct name once, as the text writes it. Never invent.
- "types" is up to three of the listed entry types it could be, most likely first.`;

const SYSTEM = `You build a story codex from a writer's text. List the entries the text names, their facts and their connections.
Rules:
- Include only what the text states or clearly implies. Never invent.
- Use only the entry types, fields and connection types listed. Refer to entries by name.
- If an entry is already in the codex, use its codex name. If the text calls it by another name,
  give that name as the entry name and set "sameAs" to the codex name.
- Facts are only for fields marked "changes over time". Set "when" only if the text states a date.
- Separate several values in one field with ";". Write amounts as a number then a project unit.
- For every item, "quote" is the shortest exact span of the text that supports it, copied exactly.
- "confidence" is 0 to 1: how sure you are the text supports the item or field.`;

type CodexType = ExtractionCodex['types'][number];
type CodexField = CodexType['fields'][number];

function describeField(f: CodexField): string {
  // The value is ignored: the app links the scene the quote is in.
  if (f.kind === 'narrativeRef' || f.kind === 'narrativeRefList')
    return `${f.label} (only if this scene does it; answer "this scene")`;
  const opts = f.options.length ? `: ${f.options.join(' | ')}` : '';
  return `${f.label} (${f.kind}${opts}${f.timeVarying ? ', changes over time' : ''})`;
}
const extractFields = (t: CodexType) => t.fields.filter((f) => fieldAi(f) === 'extract');
const COMMON_FIELDS = new Set(['begins', 'ends', 'status']);

/** A type's line for pass 1: the writer's description, else its group and telling fields. */
function typeLine(t: CodexType, groups: Map<string, string>): string {
  if (t.description?.trim()) return `- ${t.name} — ${t.description.trim()}`;
  const telling = extractFields(t)
    .filter((f) => !COMMON_FIELDS.has(f.key))
    .slice(0, 4)
    .map((f) => f.label);
  return `- ${t.name} — ${groups.get(t.group) ?? t.group}${telling.length ? `: ${telling.join(', ')}` : ''}`;
}

const textBlock = (src: ExtractionSource) => {
  const where = src.heading
    ? `the scene "${src.heading}" of "${src.document.title}"`
    : `"${src.document.title}"`;
  return `Text of ${where}:\n<<<TEXT\n${src.text}\nTEXT>>>`;
};

/** Pass 1: only type names and one-liners, which every scene in the project shares. */
export function mentionsPrompt(
  src: ExtractionSource,
  codex: ExtractionCodex,
  groups: Map<string, string>,
): { stable: string; prompt: string } {
  return {
    stable: `Entry types:\n${codex.types.map((t) => typeLine(t, groups)).join('\n')}`,
    prompt: textBlock(src),
  };
}

function calendarLine(codex: ExtractionCodex): string {
  const c = codex.calendar;
  if (!c) return 'Dates: this project has no calendar, so leave them out.';
  return `Dates: write "<year> <era>", "<month> <year> <era>" or "<day> <month> <year> <era>". Eras: ${c.eras.map((e) => e.name).join(', ')}. Months: ${c.months.map((m) => m.name).join(', ')}.`;
}

/** Pass 2: project-level text first, then only what pass 1 found. */
export function fieldsPrompt(
  src: ExtractionSource,
  codex: ExtractionCodex,
  scope: ReturnType<typeof extractionScope>,
): { stable: string; prompt: string } {
  const typeName = new Map(codex.types.map((t) => [t.key, t.name]));
  const names = (keys: string[]) =>
    keys
      .map((k) => typeName.get(k))
      .filter(Boolean)
      .join(', ');
  const links = codex.linkTypes.map(
    (l) =>
      `- "${l.label}" (reverse "${l.inverseLabel}"; from ${names(l.fromTypeKeys) || 'any'} to ${names(l.toTypeKeys) || 'any'})`,
  );
  const types = scope.types.map(
    (t) => `- ${t.name} (fields: ${extractFields(t).map(describeField).join('; ') || 'none'})`,
  );
  const entries = scope.entries.map(
    (e) =>
      `- ${e.name} (${typeName.get(e.typeKey) ?? 'entry'}${e.aliases.length ? `; also ${e.aliases.join(', ')}` : ''})`,
  );
  return {
    stable: `${calendarLine(codex)}\n\nConnection types:\n${links.join('\n') || '- none'}`,
    prompt: [
      `Entry types:\n${types.join('\n')}`,
      `Codex entries:\n${entries.join('\n') || '- none yet'}`,
      textBlock(src),
    ].join('\n\n'),
  };
}

const NOT_NAMES = new Set(
  'The A An And But Or So She He It His Her Hers They Them Their We You I My Our Then When Where With This That These Those What Who Why How There Here Day Night Later Continuous Morning Evening Cut Fade'.split(
    ' ',
  ),
);

/**
 * Deterministic stand-in for a model (AI_MOCK runs): every capitalised word in the text that isn't
 * a common word is a mention, and becomes an entry of the first listed type.
 */
export const mockExtraction: MockResponder = (prompt) => {
  const flat = prompt.replace(/\\n/g, ' ');
  const text = /<<<TEXT([\s\S]*?)TEXT>>>/.exec(flat)?.[1] ?? '';
  const names = [...new Set(text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])].filter(
    (w) => !NOT_NAMES.has(w),
  );
  if (flat.includes('Task: mentions')) {
    const first = /Entry types:\s*- (.+?) —/.exec(flat)?.[1] ?? 'Entry';
    return { mentions: names.map((name) => ({ name, types: [first] })) };
  }
  const type = /Entry types:\s*- (.+?) \(/.exec(flat)?.[1] ?? 'Entry';
  const out: ExtractionOutput = {
    entries: names.map((name) => ({
      name,
      type,
      aliases: [],
      summary: '',
      fields: [],
      sameAs: null,
      confidence: 0.95,
      quote: name,
    })),
    facts: [],
    links: [],
  };
  return out;
};

/**
 * AI-3: extracts proposed codex changes from a document or one scene. Writes one proposal for the
 * writer to review; never the codex itself (AGENTS.md rule 7).
 */
export const extract: JobHandler = async (job, { db, keySecret }) => {
  const parsed = extractJobInput.safeParse(job.input);
  if (!parsed.success) throw new Invalid('Extraction needs a document to read');
  const ai = await prepareAi(db, job, 'extraction', keySecret, mockExtraction);
  const [src, codex] = await Promise.all([
    extractionSource(db, ai.ctx, parsed.data),
    extractionCodex(db, ai.ctx),
  ]);
  if (!src.text.trim()) throw new Invalid('There is no text to extract from yet');
  if (!codex.types.length)
    throw new Invalid('Add an entry type to the codex before extracting entries');
  const groups = new Map(ai.ctx.project.typeGroups.map((g) => [g.key, g.name]));
  const first = await generateStructured({
    model: ai.cheap.model,
    modelId: ai.cheap.modelId,
    schema: mentionOutput,
    system: MENTION_SYSTEM,
    ...mentionsPrompt(src, codex, groups),
  });
  const firstCost = await ai.record(first.usage, PROMPT_VERSION, {
    pass: 'mentions',
    promptChars: first.promptChars,
    modelId: ai.cheap.modelId,
  });

  const scope = extractionScope(first.object.mentions, codex, src.text);
  const warnings = scope.unclassified.length
    ? [
        `Couldn’t place ${scope.unclassified.length} names in a type: ${scope.unclassified.join(', ')}.`,
      ]
    : [];
  const second = scope.types.length
    ? await generateStructured({
        model: ai.model,
        modelId: ai.modelId,
        schema: extractionOutput,
        system: SYSTEM,
        ...fieldsPrompt(src, codex, scope),
      })
    : null;
  const secondCost = second
    ? await ai.record(second.usage, PROMPT_VERSION, {
        pass: 'fields',
        promptChars: second.promptChars,
      })
    : 0;

  const costMicros = addCosts(firstCost, secondCost);
  const built = second ? proposalChanges(second.object, codex, src) : { changes: [], warnings: [] };
  const proposal = await saveProposal(db, ai.ctx, {
    jobId: job._id,
    source: src,
    changes: built.changes,
    warnings: [...warnings, ...built.warnings],
    model: ai.modelId,
    usage: {
      tokensIn: first.usage.tokensIn + (second?.usage.tokensIn ?? 0),
      tokensOut: first.usage.tokensOut + (second?.usage.tokensOut ?? 0),
      costMicros,
    },
  });
  return {
    proposalId: proposal._id.toHexString(),
    changes: proposal.changes.length,
    costMicros,
    costKnown: costMicros !== null,
  };
};
