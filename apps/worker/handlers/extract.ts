import { generateStructured, type MockResponder } from '@epic/ai';
import {
  extractionCodex,
  extractionSource,
  Invalid,
  proposalChanges,
  saveProposal,
  type ExtractionCodex,
  type ExtractionSource,
} from '@epic/core';
import { extractionOutput, extractJobInput, type ExtractionOutput } from '@epic/schemas/proposals';
import { prepareAi } from '../ai';
import type { JobHandler } from '../handlers';

export const PROMPT_VERSION = 'extract-1';

const SYSTEM = `You build a story codex from a writer's text. List the entries the text names
(characters, places, groups, objects, events), their facts and their connections.
Rules:
- Include only what the text states or clearly implies. Never invent.
- Use only the entry types, fields and connection types listed. Refer to entries by name.
- If an entry is already in the codex, use its codex name. If the text calls it by another name,
  give that name as the entry name and set "sameAs" to the codex name.
- Facts are only for fields marked "changes over time".
- For every item, "quote" is the shortest exact span of the text that supports it, copied exactly.
- "confidence" is 0 to 1: how sure you are the text supports the item.`;

const MAX_CODEX_ENTRIES = 500;

function describeField(f: ExtractionCodex['types'][number]['fields'][number]): string {
  const opts = f.options.length ? `: ${f.options.join(' | ')}` : '';
  return `${f.label} (${f.kind}${opts}${f.timeVarying ? ', changes over time' : ''})`;
}

export function buildPrompt(src: ExtractionSource, codex: ExtractionCodex): string {
  const typeName = new Map(codex.types.map((t) => [t.key, t.name]));
  const names = (keys: string[]) =>
    keys
      .map((k) => typeName.get(k))
      .filter(Boolean)
      .join(', ');
  const types = codex.types.map(
    (t) => `- ${t.name} (fields: ${t.fields.map(describeField).join('; ') || 'none'})`,
  );
  const links = codex.linkTypes.map(
    (l) =>
      `- "${l.label}" (reverse "${l.inverseLabel}"; from ${names(l.fromTypeKeys) || 'any'} to ${names(l.toTypeKeys) || 'any'})`,
  );
  const entries = codex.entries
    .slice(0, MAX_CODEX_ENTRIES)
    .map(
      (e) =>
        `- ${e.name} (${typeName.get(e.typeKey) ?? 'entry'}${e.aliases.length ? `; also ${e.aliases.join(', ')}` : ''})`,
    );
  const where = src.heading
    ? `the scene "${src.heading}" of "${src.document.title}"`
    : `"${src.document.title}"`;
  return [
    `Entry types:\n${types.join('\n')}`,
    `Connection types:\n${links.join('\n') || '- none'}`,
    `Codex entries:\n${entries.join('\n') || '- none yet'}`,
    `Text of ${where}:\n<<<TEXT\n${src.text}\nTEXT>>>`,
  ].join('\n\n');
}

const NOT_NAMES = new Set(
  'The A An And But Or So She He It His Her Hers They Them Their We You I My Our Then When Where With This That These Those What Who Why How There Here Day Night Later Continuous Morning Evening Cut Fade'.split(
    ' ',
  ),
);

/**
 * Deterministic stand-in for a model (AI_MOCK runs): every capitalised word in the text that isn't
 * a common word becomes an entry of the first listed type.
 */
export const mockExtraction: MockResponder = (prompt) => {
  const flat = prompt.replace(/\\n/g, ' ');
  const text = /<<<TEXT([\s\S]*?)TEXT>>>/.exec(flat)?.[1] ?? '';
  const type = /Entry types:\s*- (.+?) \(/.exec(flat)?.[1] ?? 'Entry';
  const names = [...new Set(text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])].filter(
    (w) => !NOT_NAMES.has(w),
  );
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
  const { object, usage } = await generateStructured({
    model: ai.model,
    modelId: ai.modelId,
    schema: extractionOutput,
    system: SYSTEM,
    prompt: buildPrompt(src, codex),
  });
  const costMicros = await ai.record(usage, PROMPT_VERSION);
  const proposal = await saveProposal(db, ai.ctx, {
    jobId: job._id,
    source: src,
    changes: proposalChanges(object, codex, src),
    model: ai.modelId,
    usage,
  });
  return {
    proposalId: proposal._id.toHexString(),
    changes: proposal.changes.length,
    costMicros,
    costKnown: costMicros !== null,
  };
};
