import { z } from 'zod';
import { narrativeRefSchema } from './api';
import { storyTimeSchema } from './entity-fields';

/** Input of an `extract` job (AI-3): a whole document, or one scene in it. */
export const extractJobInput = z.object({
  documentKey: z.string().min(1),
  sceneKey: z.string().min(1).nullish(),
});

const confidence = z.number().min(0).max(1);
const quote = z.string().max(1_000);

/**
 * What the model returns for an extraction run (AI-3), validated before anything is stored
 * (AGENTS.md rule 8). Every field is required and values are strings so every provider's
 * structured-output mode accepts the schema; code turns names into keys and strings into values.
 */
export const extractionOutput = z.object({
  entries: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        type: z.string().min(1).max(100),
        aliases: z.array(z.string().min(1).max(200)).max(20),
        summary: z.string().max(2_000),
        // Uncapped here: an overlong answer is trimmed by confidence in code, never failed.
        fields: z.array(z.object({ field: z.string(), value: z.string(), confidence })),
        /** The existing entry this is, when the text calls it by another name; else null. */
        sameAs: z.string().max(200).nullable(),
        confidence,
        quote,
      }),
    )
    .max(200),
  facts: z
    .array(
      z.object({
        entry: z.string(),
        field: z.string(),
        value: z.string(),
        /** The story date if the text states one, in the calendar format the prompt gives. */
        when: z.string().max(100).nullable(),
        confidence,
        quote,
      }),
    )
    .max(200),
  links: z
    .array(
      z.object({
        from: z.string(),
        type: z.string(),
        to: z.string(),
        note: z.string().max(500),
        confidence,
        quote,
      }),
    )
    .max(200),
});
export type ExtractionOutput = z.infer<typeof extractionOutput>;

/** Pass 1 of extraction: who and what the text names, with candidate entry types. */
export const mentionOutput = z.object({
  mentions: z
    .array(z.object({ name: z.string().min(1).max(200), types: z.array(z.string()).max(3) }))
    .max(300),
});
export type MentionOutput = z.infer<typeof mentionOutput>;

const key = z.string().min(1).max(64);
/** An entry in a proposal: an existing entry's key, or `new:<n>` for one the proposal creates. */
const entryRef = key;
export const isNewRef = (ref: string) => /^new:\d+$/.test(ref);
const name = z.string().trim().min(1, 'Give it a name').max(200);
const quoteField = quote.default('');

/** The payload of each change op extraction proposes. Edits are validated against these. */
export const PROPOSAL_PAYLOADS = {
  createEntity: z.object({
    ref: z.string().regex(/^new:\d+$/),
    typeKey: key,
    name,
    aliases: z.array(name).max(50).default([]),
    summary: z.string().trim().max(5_000).default(''),
    fields: z.record(z.string(), z.unknown()).default({}),
    /** AI-5: an existing entry the writer chose instead of creating a new one. */
    useKey: key.nullable().default(null),
    /** AI-5: the match was uncertain, so the writer must choose before accepting. */
    needsChoice: z.boolean().default(false),
    /** Set when applied, so later changes can still point at the new entry. */
    createdKey: key.nullable().default(null),
    quote: quoteField,
  }),
  addAlias: z.object({ entity: entryRef, alias: name, quote: quoteField }),
  updateField: z.object({ entity: entryRef, field: key, value: z.unknown(), quote: quoteField }),
  addFact: z.object({
    entity: entryRef,
    field: key,
    value: z.unknown(),
    storyTime: storyTimeSchema,
    narrativeRefs: z.array(narrativeRefSchema).max(20).default([]),
    quote: quoteField,
  }),
  createLink: z.object({
    typeKey: key,
    from: entryRef,
    to: entryRef,
    note: z.string().trim().max(1_000).default(''),
    quote: quoteField,
  }),
} as const;

export type ProposalPayloads = {
  [K in keyof typeof PROPOSAL_PAYLOADS]: z.infer<(typeof PROPOSAL_PAYLOADS)[K]>;
};
export type ExtractOp = keyof typeof PROPOSAL_PAYLOADS;

export const CHANGE_STATUSES = ['pending', 'accepted', 'rejected', 'applied'] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/** Review edits: set statuses and/or replace payload fields of several changes at once. */
export const proposalPatch = z.object({
  changes: z
    .array(
      z.object({
        index: z.number().int().min(0),
        status: z.enum(['pending', 'accepted', 'rejected']).optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export interface ProposalChangeDto {
  index: number;
  op: string;
  payload: Record<string, unknown>;
  confidence: number;
  matchCandidates: { key: string; score: number }[];
  status: ChangeStatus;
  flags: string[];
}

export interface ProposalSummaryDto {
  id: string;
  status: 'pending' | 'partially-applied' | 'applied' | 'rejected';
  documentKey: string | null;
  /** Whether the run covered one scene or the whole document. */
  scope: 'scene' | 'document';
  createdAt: string;
  counts: Record<ChangeStatus, number>;
  costMicros: number;
}

export interface ProposalDto extends ProposalSummaryDto {
  changes: ProposalChangeDto[];
  warnings: string[];
  appliedSeq: number | null;
  model: string;
  /** The source as the reader sees it now (markers hidden), for highlighting quotes. */
  source: { documentTitle: string; heading: string | null; text: string };
}
