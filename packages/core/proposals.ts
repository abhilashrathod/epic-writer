import { ObjectId, type Db } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import {
  documentVersions,
  jobs,
  proposals,
  readHeadByKey,
  readHeads,
  type DocumentDoc,
  type EntityDoc,
  type EntityTypeDoc,
  type FieldDef,
  type LinkTypeDoc,
  type NarrativeRef,
  type ProposalDoc,
  type ProposalFlag,
  type StoryTime,
  type Unit,
  type TextRange,
} from '@epic/db';
import { displayText, extractScenes } from '@epic/fountain';
import {
  isNewRef,
  PROPOSAL_PAYLOADS,
  proposalPatch,
  type ChangeStatus,
  type ExtractionOutput,
  type ExtractOp,
  type ProposalDto,
  type MentionOutput,
  type ProposalPayloads,
  type ProposalSummaryDto,
} from '@epic/schemas/proposals';
import { fieldAi } from '@epic/schemas';
import { parseStoryDate, type CalendarShape } from './calendar';
import { mentions as textMentions } from './codex-context';
import { commitInSession, type Change } from './commit';
import { entityChange, takenSlugs, type PendingEntities } from './entities';
import { Conflict, DomainError, Invalid, NotFound } from './errors';
import { factChange } from './facts';
import { loadNarrativeIndex } from './narrative-index';
import { currentNarrativeOrder, isNarrativeRefKind } from './narrative-refs';
import { matchCandidates, nameScore, normaliseName, STRONG_MATCH } from './identity';
import { linkChange } from './links';
import type { ProjectContext } from './works';

type ProposalChange = ProposalDoc['changes'][number];

// ---------- extraction input ----------

export interface ExtractionSource {
  document: DocumentDoc;
  sceneKey: string | null;
  heading: string | null;
  /** The text as the reader sees it (markers hidden): what the model reads. */
  text: string;
  range: TextRange | null;
  documentVersionId: ObjectId | null;
  /** Each scene's reader text with its narrative position, to place quoted spans. */
  scenes: { text: string; ref: NarrativeRef }[];
}

const pad = (n: number) => String(n).padStart(4, '0');
/** Reader text without the spaces hidden markers leave at line ends. */
const readerText = (raw: string) => displayText(raw).replace(/[ \t]+$/gm, '');

/** The working text of a document, or of one scene in it, as extraction reads it. */
export async function extractionSource(
  db: Db,
  ctx: ProjectContext,
  input: { documentKey: string; sceneKey?: string | null },
): Promise<ExtractionSource> {
  const document = await readHeadByKey(db, 'documents', ctx.scope, input.documentKey);
  if (!document) throw new NotFound('Document not found');
  if (document.kind !== 'text')
    throw new Invalid(`"${document.title}" is a container and has no text`);
  const working = await documentVersions.findWorking(db, {
    ...ctx.scope,
    documentKey: document.key,
  });
  const raw = working?.text ?? '';
  const spans = extractScenes(raw, document.format);
  const scenes = spans.flatMap((s, i) =>
    s.key
      ? [
          {
            key: s.key,
            heading: s.heading,
            range: { from: s.from, to: s.to },
            text: readerText(raw.slice(s.from, s.to)),
            ref: {
              workKey: document.workKey,
              documentKey: document.key,
              sceneKey: s.key,
              order: `${document.orderPath}.${pad(i + 1)}`,
            },
          },
        ]
      : [],
  );
  const scene = input.sceneKey ? scenes.find((s) => s.key === input.sceneKey) : undefined;
  if (input.sceneKey && !scene) throw new NotFound('That scene is no longer in the document');
  return {
    document,
    sceneKey: scene?.key ?? null,
    heading: scene?.heading ?? null,
    text: scene ? scene.text : readerText(raw),
    range: scene?.range ?? null,
    documentVersionId: working?._id ?? null,
    scenes: scene ? [scene] : scenes,
  };
}

export interface ExtractionCodex {
  entries: EntityDoc[];
  types: EntityTypeDoc[];
  linkTypes: LinkTypeDoc[];
  calendar?: CalendarShape | null;
  units?: Unit[];
}

/** The codex extraction checks against: scrapped entries are left out (AGENTS.md rule 9). */
export async function extractionCodex(db: Db, ctx: ProjectContext): Promise<ExtractionCodex> {
  const [entries, types, linkTypes, calendar] = await Promise.all([
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'entityTypes', ctx.scope),
    readHeads(db, 'linkTypes', ctx.scope),
    readHeadByKey(db, 'calendars', ctx.scope, ctx.project.defaultCalendarKey),
  ]);
  return {
    entries: entries.filter((e) => e.canonState !== 'scrapped'),
    types: types.sort((a, b) => a.order - b.order),
    linkTypes,
    calendar,
    units: ctx.project.units,
  };
}

// ---------- model output → proposed changes ----------

/**
 * Pass 2's scope from pass 1's mentions. A mention of a known entry takes that entry's type without
 * classification; anything else brings its candidate types. Known names in the text count even if
 * pass 1 missed them.
 */
export function extractionScope(
  found: MentionOutput['mentions'],
  codex: ExtractionCodex,
  text: string,
): { types: EntityTypeDoc[]; entries: EntityDoc[]; unclassified: string[] } {
  const byName = typeLookup(codex.types);
  const entries = new Map<string, EntityDoc>();
  const typeKeys = new Set<string>();
  const entryByKey = new Map(codex.entries.map((e) => [e.key, e]));
  const unclassified: string[] = [];
  const addKnown = (e: EntityDoc) => {
    entries.set(e.key, e);
    typeKeys.add(e.typeKey);
  };
  for (const m of found) {
    const hits = matchCandidates([m.name], codex.entries, 3);
    if (hits[0] && hits[0].score >= STRONG_MATCH) {
      addKnown(entryByKey.get(hits[0].key)!);
      continue;
    }
    for (const h of hits) entries.set(h.key, entryByKey.get(h.key)!);
    const candidates = m.types.flatMap((t) => byName.get(normaliseName(t)) ?? []);
    for (const t of candidates) typeKeys.add(t.key);
    if (!candidates.length) unclassified.push(m.name);
  }
  for (const e of codex.entries)
    if ([e.name, ...e.aliases].some((n) => textMentions(text, n))) addKnown(e);
  return {
    types: codex.types.filter((t) => typeKeys.has(t.key)),
    entries: [...entries.values()],
    unclassified,
  };
}

function typeLookup(types: EntityTypeDoc[]): Map<string, EntityTypeDoc> {
  const out = new Map<string, EntityTypeDoc>();
  for (const t of types) {
    out.set(normaliseName(t.pluralName), t);
    out.set(normaliseName(t.name), t);
  }
  return out;
}

/** The per-entry safety net: past this, the least certain fields are dropped with a warning. */
export const MAX_FIELDS_PER_ENTRY = 60;

type Coerced = { value: unknown; notInChoices?: boolean } | undefined;
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();
const splitItems = (v: string) =>
  v
    .split(/\s*[;\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * A model's string value as a field value, or undefined when it can't be one. A choice outside the
 * field's options is kept as written and marked, so the writer decides.
 */
function coerce(
  f: FieldDef,
  raw: string,
  resolveName: (name: string) => string | null,
  codex: Pick<ExtractionCodex, 'calendar' | 'units'>,
): Coerced {
  const v = raw.trim();
  if (!v) return undefined;
  const choice = (x: string) => f.options.find((o) => o.toLowerCase() === x.toLowerCase());
  const wrap = (value: unknown): Coerced => (value === undefined ? undefined : { value });
  switch (f.kind) {
    case 'text':
    case 'richtext':
      return { value: v };
    case 'number': {
      const n = Number(v.replace(/,/g, ''));
      return Number.isFinite(n) ? { value: n } : undefined;
    }
    case 'enum':
      return choice(v) ? { value: choice(v) } : { value: v, notInChoices: true };
    case 'multiEnum': {
      const items = splitItems(v);
      if (items.every(choice)) return { value: items.map(choice) };
      return { value: items, notInChoices: true };
    }
    case 'boolean':
      return wrap(/^(true|yes)$/i.test(v) ? true : /^(false|no)$/i.test(v) ? false : undefined);
    case 'entityRef':
      return wrap(resolveName(v) ?? undefined);
    case 'entityRefList': {
      const keys = splitItems(v).flatMap((x) => resolveName(x) ?? []);
      return keys.length ? { value: [...new Set(keys)] } : undefined;
    }
    case 'list':
      return { value: splitItems(v) };
    case 'date':
      return wrap((codex.calendar && parseStoryDate(codex.calendar, v)) || undefined);
    case 'quantity': {
      const m = /^([\d.,]+)\s*(.*)$/.exec(v);
      const unitName = m?.[2]?.toLowerCase();
      const unit = codex.units?.find((u) =>
        [u.key, u.abbr, u.name].some((x) => x.toLowerCase() === unitName),
      );
      return m && unit
        ? { value: { value: Number(m[1]!.replace(/,/g, '')), unitKey: unit.key } }
        : undefined;
    }
    case 'composition': {
      const rows = splitItems(v).flatMap((x) => {
        const m = /^(.+?)[\s:=]+([\d,]+)$/.exec(x);
        return m ? [{ label: m[1]!.trim(), count: Number(m[2]!.replace(/,/g, '')) }] : [];
      });
      return rows.length ? { value: rows } : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * A narrative-ref field can only name the scene the evidence is in; the model's text is ignored so
 * it can't invent a place. A list keeps what it has, and a scene already listed proposes nothing.
 */
function sceneRefValue(f: FieldDef, at: NarrativeRef | undefined, current: unknown): Coerced {
  if (!at) return undefined;
  if (f.kind === 'narrativeRef') return { value: at };
  const list = Array.isArray(current) ? (current as { sceneKey: string | null }[]) : [];
  return list.some((r) => r.sceneKey === at.sceneKey) ? undefined : { value: [...list, at] };
}

const fieldNamed = (type: EntityTypeDoc | undefined, name: string) => {
  const n = normaliseName(name);
  return type?.fields.find((f) => normaliseName(f.key) === n || normaliseName(f.label) === n);
};

/**
 * Turns validated model output into proposed changes, resolving identities in code (AI-5): a name
 * that strongly matches an existing entry becomes aliases and field updates on it; an uncertain
 * match keeps its candidates and must be decided by the writer; links and facts name entries,
 * which are resolved to keys or to `new:<n>` refs. Anything that can't be resolved is dropped.
 */
export function proposalChanges(
  out: ExtractionOutput,
  codex: ExtractionCodex,
  source: Pick<ExtractionSource, 'document' | 'scenes' | 'text'>,
): { changes: ProposalChange[]; warnings: string[] } {
  const typeByName = typeLookup(codex.types);
  const warnings: string[] = [];
  let refused = 0;
  /** Only `extract` fields can be proposed, whatever the model sends back. */
  const extractable = (type: EntityTypeDoc | undefined, name: string) => {
    const f = fieldNamed(type, name);
    if (f && fieldAi(f) !== 'extract') {
      refused += 1;
      return undefined;
    }
    return f;
  };
  const entryByKey = new Map(codex.entries.map((e) => [e.key, e]));
  const typeOfRef = new Map<string, EntityTypeDoc>();
  const named = new Map<string, string>(); // normalised name → key or new ref
  const strongMatch = (name: string) => {
    const best = matchCandidates([name], codex.entries, 1)[0];
    return best && best.score >= STRONG_MATCH ? best.key : null;
  };
  const resolveName = (name: string) => named.get(normaliseName(name)) ?? strongMatch(name);
  const findType = (key: string) => codex.types.find((t) => t.key === entryByKey.get(key)?.typeKey);
  const typeOf = (ref: string) => typeOfRef.get(ref) ?? findType(ref);

  // Pass 1: decide who each extracted entry is, so later references resolve in any order.
  let n = 0;
  const decided = out.entries.flatMap((e) => {
    const names = [e.name, ...e.aliases];
    const candidates = matchCandidates(names, codex.entries);
    if (e.sameAs) {
      const same = codex.entries.find((x) =>
        [x.name, ...x.aliases].some((m) => nameScore(e.sameAs!, m) === 1),
      );
      if (same) {
        const found = candidates.find((c) => c.key === same.key);
        if (found) found.score = Math.max(found.score, e.confidence);
        else candidates.push({ key: same.key, score: Math.round(e.confidence * 100) / 100 });
        candidates.sort((a, b) => b.score - a.score);
      }
    }
    const best = candidates[0];
    const existing = best && best.score >= STRONG_MATCH ? entryByKey.get(best.key) : undefined;
    const type = existing ? findType(existing.key) : typeByName.get(normaliseName(e.type));
    if (!type) return [];
    const ref = existing?.key ?? `new:${++n}`;
    typeOfRef.set(ref, type);
    for (const name of names)
      if (!named.has(normaliseName(name))) named.set(normaliseName(name), ref);
    return [{ e, names, candidates, existing, type, ref }];
  });

  const changes: ProposalChange[] = [];
  const haystack = collapse(source.text);
  const push = <K extends ExtractOp>(
    op: K,
    payload: Record<string, unknown>,
    confidence: number,
    candidates: { key: string; score: number }[] = [],
    extraFlags: ProposalFlag[] = [],
  ) => {
    const quote = collapse(String(payload.quote ?? ''));
    const found = quote !== '' && haystack.includes(quote);
    const flags: ProposalFlag[] = found ? extraFlags : ['quote-not-found', ...extraFlags];
    changes.push({
      op,
      payload: PROPOSAL_PAYLOADS[op].parse(payload) as Record<string, unknown>,
      confidence: found ? Math.round(confidence * 100) / 100 : 0,
      matchCandidates: candidates,
      status: 'pending',
      ...(flags.length ? { flags } : {}),
    });
  };

  const onlyScene = source.scenes.length === 1 ? source.scenes[0]!.ref : undefined;
  const placeOf = (quote: string) => {
    const q = collapse(quote);
    return (
      (q ? source.scenes.find((s) => collapse(s.text).includes(q))?.ref : undefined) ?? onlyScene
    );
  };

  // Pass 2: entries.
  for (const { e, names, candidates, existing, type, ref } of decided) {
    const fields: Record<string, { value: unknown; confidence: number }> = {};
    const outOfChoices: { key: string; value: unknown; confidence: number }[] = [];
    const ranked = [...e.fields].sort((a, b) => b.confidence - a.confidence);
    if (ranked.length > MAX_FIELDS_PER_ENTRY)
      warnings.push(
        `"${e.name}": kept the ${MAX_FIELDS_PER_ENTRY} surest fields and dropped ${ranked.length - MAX_FIELDS_PER_ENTRY}.`,
      );
    for (const { field, value, confidence } of ranked.slice(0, MAX_FIELDS_PER_ENTRY)) {
      const f = extractable(type, field);
      const v =
        f &&
        (isNarrativeRefKind(f.kind)
          ? sceneRefValue(f, placeOf(e.quote), existing?.fields[f.key])
          : coerce(f, value, resolveName, codex));
      if (!f || !v || v.value === ref) continue;
      if (v.notInChoices) outOfChoices.push({ key: f.key, value: v.value, confidence });
      else fields[f.key] = { value: v.value, confidence };
    }
    const flagged = (entity: string) => {
      for (const o of outOfChoices)
        push(
          'updateField',
          { entity, field: o.key, value: o.value, quote: e.quote },
          o.confidence,
          [],
          ['value-not-in-choices'],
        );
    };
    if (!existing) {
      push(
        'createEntity',
        {
          ref,
          typeKey: type.key,
          name: e.name,
          aliases: e.aliases.filter((a) => a.trim() && normaliseName(a) !== normaliseName(e.name)),
          summary: e.summary,
          fields: Object.fromEntries(Object.entries(fields).map(([k, x]) => [k, x.value])),
          needsChoice: candidates.length > 0,
          quote: e.quote,
        },
        e.confidence,
        candidates,
      );
      flagged(ref);
      continue;
    }
    const known = new Set([existing.name, ...existing.aliases].map(normaliseName));
    for (const alias of names) {
      if (known.has(normaliseName(alias))) continue;
      known.add(normaliseName(alias));
      push(
        'addAlias',
        { entity: existing.key, alias, quote: e.quote },
        Math.min(e.confidence, candidates[0]!.score),
        candidates,
      );
    }
    for (const [field, { value, confidence }] of Object.entries(fields)) {
      if (JSON.stringify(existing.fields[field]) === JSON.stringify(value)) continue;
      push('updateField', { entity: existing.key, field, value, quote: e.quote }, confidence);
    }
    flagged(existing.key);
  }

  // A fact sits in the scene its quote is in, at the date the text states, else the document's.
  const documentTime: StoryTime = source.document.storyTime ?? {
    start: 0,
    end: null,
    precision: 'unknown',
  };
  for (const f of out.facts) {
    const entity = resolveName(f.entry);
    const field = entity ? extractable(typeOf(entity), f.field) : undefined;
    if (!entity || !field?.timeVarying) continue;
    const coerced = coerce(field, f.value, resolveName, codex);
    if (coerced === undefined) continue;
    const at = placeOf(f.quote);
    const stated = f.when && codex.calendar ? parseStoryDate(codex.calendar, f.when) : null;
    const extra: ProposalFlag[] = [
      ...(coerced.notInChoices ? (['value-not-in-choices'] as const) : []),
      ...(!at && !stated ? (['no-anchor'] as const) : []),
    ];
    push(
      'addFact',
      {
        entity,
        field: field.key,
        value: coerced.value,
        storyTime: stated ?? documentTime,
        narrativeRefs: at ? [at] : [],
        quote: f.quote,
      },
      f.confidence,
      [],
      extra,
    );
  }

  for (const l of out.links) {
    const label = normaliseName(l.type);
    const type = codex.linkTypes.find(
      (t) => normaliseName(t.label) === label || normaliseName(t.inverseLabel) === label,
    );
    let [from, to] = [resolveName(l.from), resolveName(l.to)];
    if (!type || !from || !to || from === to) continue;
    // Named by its reverse ("child of" for a "parent of" type): swap the ends.
    if (normaliseName(type.label) !== label) [from, to] = [to, from];
    push('createLink', { typeKey: type.key, from, to, note: l.note, quote: l.quote }, l.confidence);
  }
  if (refused) warnings.push(`Ignored ${refused} values for fields the AI may not write.`);
  return { changes, warnings };
}

/** Stores one extraction run's proposal (AGENTS.md rule 7: AI output never writes the codex). */
export function saveProposal(
  db: Db,
  ctx: ProjectContext,
  p: {
    jobId: ObjectId;
    source: ExtractionSource;
    changes: ProposalChange[];
    warnings?: string[];
    model: string;
    usage: { tokensIn: number; tokensOut: number; costMicros: number | null };
  },
): Promise<ProposalDoc> {
  return proposals.insert(db, {
    ...ctx.scope,
    jobId: p.jobId,
    source: {
      kind: 'document',
      documentKey: p.source.document.key,
      range: p.source.range,
      documentVersionId: p.source.documentVersionId,
    },
    status: 'pending',
    changes: p.changes,
    ...(p.warnings?.length ? { warnings: p.warnings } : {}),
    appliedSeq: null,
    model: p.model,
    tokensIn: p.usage.tokensIn,
    tokensOut: p.usage.tokensOut,
    costMicros: p.usage.costMicros ?? 0,
  });
}

// ---------- review ----------

async function requireProposal(db: Db, ctx: ProjectContext, id: string): Promise<ProposalDoc> {
  const p = ObjectId.isValid(id)
    ? await proposals.find(db, { ...ctx.scope, id: new ObjectId(id) })
    : null;
  if (!p) throw new NotFound('Proposal not found');
  return p;
}

function overallStatus(changes: ProposalChange[]): ProposalDoc['status'] {
  const open = changes.some((c) => c.status === 'pending' || c.status === 'accepted');
  if (changes.some((c) => c.status === 'applied')) return open ? 'partially-applied' : 'applied';
  return !open && changes.length > 0 ? 'rejected' : 'pending';
}

function summary(p: ProposalDoc): ProposalSummaryDto {
  const counts: Record<ChangeStatus, number> = { pending: 0, accepted: 0, rejected: 0, applied: 0 };
  for (const c of p.changes) counts[c.status as ChangeStatus] += 1;
  return {
    id: p._id.toHexString(),
    status: p.status,
    documentKey: p.source.documentKey,
    scope: p.source.range ? 'scene' : 'document',
    createdAt: p.createdAt.toISOString(),
    counts,
    costMicros: p.costMicros,
  };
}

/** A document's extraction runs, newest first. */
export async function listProposals(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
): Promise<ProposalSummaryDto[]> {
  return (await proposals.listForDocument(db, { ...ctx.scope, documentKey })).map(summary);
}

/** A proposal with its changes and its source text as the reader sees it now. */
export async function getProposal(db: Db, ctx: ProjectContext, id: string): Promise<ProposalDto> {
  const p = await requireProposal(db, ctx, id);
  const job = await jobs.findInProject(db, ctx.project._id, p.jobId);
  const sceneKey = typeof job?.input.sceneKey === 'string' ? job.input.sceneKey : null;
  let source: ProposalDto['source'] = {
    documentTitle: 'Deleted document',
    heading: null,
    text: '',
  };
  if (p.source.documentKey) {
    const read = (s: string | null) =>
      extractionSource(db, ctx, { documentKey: p.source.documentKey!, sceneKey: s });
    // The scene may have been deleted since; then show the whole document.
    const src = await read(sceneKey).catch((e: unknown) => {
      if (e instanceof NotFound && sceneKey) return read(null);
      if (e instanceof NotFound) return null;
      throw e;
    });
    if (src) source = { documentTitle: src.document.title, heading: src.heading, text: src.text };
  }
  return {
    ...summary(p),
    changes: p.changes.map((c, index) => ({
      ...c,
      index,
      status: c.status as ChangeStatus,
      flags: c.flags ?? [],
    })),
    warnings: p.warnings ?? [],
    appliedSeq: p.appliedSeq,
    model: p.model,
    source,
  };
}

/**
 * Accepts, rejects or edits changes (AI-4). Edited payloads are validated against their op's
 * schema; an uncertain identity (AI-5) can't be accepted until the writer chooses.
 */
export async function reviewProposal(
  db: Db,
  ctx: ProjectContext,
  id: string,
  raw: unknown,
): Promise<ProposalDto> {
  const { changes: edits } = proposalPatch.parse(raw);
  const p = await requireProposal(db, ctx, id);
  const next = p.changes.map((c) => ({ ...c }));
  for (const edit of edits) {
    const c = next[edit.index];
    if (!c) throw new Invalid('That change isn’t in this proposal');
    if (c.status === 'applied') throw new Conflict('That change is already in the codex');
    const schema = PROPOSAL_PAYLOADS[c.op as ExtractOp];
    if (!schema) throw new Invalid(`"${c.op}" changes can’t be reviewed yet`);
    if (edit.payload) {
      // A new entry's ref ties other changes to it; it can't be edited.
      const locked = c.op === 'createEntity' ? { ref: c.payload.ref, createdKey: null } : {};
      const parsed = schema.safeParse({ ...c.payload, ...edit.payload, ...locked });
      if (!parsed.success) throw new Invalid(parsed.error.issues[0]?.message ?? 'Invalid change');
      c.payload = parsed.data as Record<string, unknown>;
      // A retyped value is checked against the type's choices when the change is committed.
      if ('value' in edit.payload) c.flags = c.flags?.filter((f) => f !== 'value-not-in-choices');
    }
    if (edit.status) {
      if (edit.status === 'accepted' && c.op === 'createEntity' && c.payload.needsChoice)
        throw new Invalid(
          `Choose whether "${String(c.payload.name)}" is a new entry or one you already have`,
        );
      if (edit.status === 'accepted' && c.flags?.includes('value-not-in-choices'))
        throw new Invalid(
          `"${String(c.payload.value)}" isn’t one of this field’s choices. Edit it or reject the change.`,
        );
      c.status = edit.status;
    }
  }
  await proposals.setReview(
    db,
    { ...ctx.scope, id: p._id },
    {
      changes: next,
      status: overallStatus(next),
    },
  );
  return getProposal(db, ctx, id);
}

type Draft = {
  index: number;
  prev?: EntityDoc;
  input: {
    typeKey: string;
    name: string;
    aliases: string[];
    summary: string;
    prominence?: string;
    canonState?: string;
    tags?: string[];
    fields: Record<string, unknown>;
  };
};

const parse = <K extends ExtractOp>(op: K, payload: unknown) =>
  PROPOSAL_PAYLOADS[op].parse(payload) as ProposalPayloads[K];

/**
 * Commits every accepted change as ONE commit by the AI on the writer's behalf (AI-4), built with
 * the same validation as hand edits. New entries get their keys up front so links, facts and
 * fields in the same proposal can point at them. Changes left pending can be applied later.
 */
export async function applyProposal(
  db: Db,
  ctx: ProjectContext,
  id: string,
): Promise<{ seq: number; applied: number }> {
  const p = await requireProposal(db, ctx, id);
  const accepted = p.changes.flatMap((c, index) => (c.status === 'accepted' ? [{ c, index }] : []));
  if (!accepted.length) throw new Invalid('Accept at least one change first');
  const payloads = p.changes.map((c) => c.payload);

  // Keys for new entries: from an earlier apply, the writer's choice of an existing entry, or new.
  const refKey = new Map<string, string>();
  const refName = new Map<string, string>();
  for (const c of p.changes) {
    if (c.op !== 'createEntity') continue;
    const pl = parse('createEntity', c.payload);
    refName.set(pl.ref, pl.name);
    const key = pl.useKey ?? pl.createdKey ?? (c.status === 'accepted' ? uuidv7() : null);
    if (key) refKey.set(pl.ref, key);
  }
  const resolve = (ref: string) => {
    if (!isNewRef(ref)) return ref;
    const key = refKey.get(ref);
    if (!key)
      throw new Invalid(
        `Accept the new entry "${refName.get(ref) ?? ref}" too: another accepted change needs it`,
      );
    return key;
  };
  const resolveValue = (v: unknown): unknown =>
    typeof v === 'string' && isNewRef(v) ? resolve(v) : Array.isArray(v) ? v.map(resolveValue) : v;
  const blame = async <T>(index: number, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof DomainError)
        throw new Invalid(`Change ${index + 1} can’t be committed: ${e.message}`);
      throw e;
    }
  };

  // A commit holds one version per entry, so every change to one entry folds into one draft.
  const drafts = new Map<string, Draft>();
  const pending: PendingEntities = new Map();
  const draftFor = async (key: string, index: number): Promise<Draft> => {
    const known = drafts.get(key);
    if (known) return known;
    const prev = await readHeadByKey(db, 'entities', ctx.scope, key);
    if (!prev) throw new Invalid(`Change ${index + 1} points to an entry that no longer exists`);
    const { typeKey, name, aliases, summary, prominence, canonState, tags, fields } = prev;
    const d: Draft = {
      index,
      prev,
      input: {
        typeKey,
        name,
        aliases: [...aliases],
        summary,
        prominence,
        canonState,
        tags,
        fields: { ...fields },
      },
    };
    drafts.set(key, d);
    return d;
  };
  const creates = accepted.filter((x) => x.c.op === 'createEntity');
  for (const { c, index } of creates) {
    const pl = parse('createEntity', c.payload);
    if (pl.useKey) {
      (await draftFor(pl.useKey, index)).input.aliases.push(pl.name, ...pl.aliases);
      continue;
    }
    const key = refKey.get(pl.ref)!;
    const { typeKey, name, aliases, summary, fields } = pl;
    drafts.set(key, { index, input: { typeKey, name, aliases, summary, fields } });
    pending.set(key, { key, typeKey, name });
    payloads[index] = { ...pl, createdKey: key };
  }
  const later: { op: 'addFact' | 'createLink'; payload: unknown; index: number }[] = [];
  for (const { c, index } of accepted) {
    if (c.op === 'createEntity') continue;
    if (c.op === 'addAlias') {
      const pl = parse('addAlias', c.payload);
      (await draftFor(resolve(pl.entity), index)).input.aliases.push(pl.alias);
    } else if (c.op === 'updateField') {
      const pl = parse('updateField', c.payload);
      (await draftFor(resolve(pl.entity), index)).input.fields[pl.field] = pl.value;
    } else if (c.op === 'addFact' || c.op === 'createLink') {
      later.push({ op: c.op, payload: c.payload, index });
    } else throw new Invalid(`"${c.op}" changes can’t be committed yet`);
  }

  const opts = { pending, proposalId: p._id };
  const taken = await takenSlugs(db, ctx);
  const changes: Change[] = [];
  for (const [key, d] of drafts) {
    const fields = Object.fromEntries(
      Object.entries(d.input.fields).map(([k, v]) => [k, resolveValue(v)]),
    );
    const built = await blame(d.index, () =>
      entityChange(db, ctx, { ...d.input, fields }, { ...opts, taken, prev: d.prev, key }),
    );
    changes.push(built.change);
  }
  // Episodes may have moved since this proposal was written.
  const places = later.length ? await loadNarrativeIndex(db, ctx) : null;
  for (const { op, payload, index } of later) {
    const built = await blame(index, () => {
      if (op === 'addFact') {
        const pl = parse('addFact', payload);
        const raw = {
          ...pl,
          entityKey: resolve(pl.entity),
          value: resolveValue(pl.value),
          narrativeRefs: pl.narrativeRefs.map((r) => ({
            ...r,
            order: currentNarrativeOrder(r, places!) ?? r.order,
          })),
        };
        return factChange(db, ctx, raw, opts);
      }
      const pl = parse('createLink', payload);
      const raw = {
        typeKey: pl.typeKey,
        fromKey: resolve(pl.from),
        toKey: resolve(pl.to),
        note: pl.note,
      };
      return linkChange(db, ctx, raw, opts);
    });
    changes.push(built.change);
  }

  const next = p.changes.map((c, i) =>
    c.status === 'accepted' ? { ...c, payload: payloads[i]!, status: 'applied' } : c,
  );
  const session = db.client.startSession();
  try {
    const seq = await session.withTransaction(async () => {
      const { seq } = await commitInSession(db, session, {
        ...ctx.scope,
        message: `Accept ${accepted.length} extracted ${accepted.length === 1 ? 'change' : 'changes'}`,
        author: { kind: 'ai', userId: ctx.userId, proposalId: p._id },
        changes,
      });
      // Guards against applying the same review twice (two tabs, a double click).
      const res = await proposals.setReview(
        db,
        { ...ctx.scope, id: p._id },
        { changes: next, status: overallStatus(next), appliedSeq: seq, ifUpdatedAt: p.updatedAt },
        { session },
      );
      if (!res.matchedCount)
        throw new Conflict('This proposal changed while committing. Reload it.');
      return seq;
    });
    return { seq, applied: accepted.length };
  } finally {
    await session.endSession();
  }
}
