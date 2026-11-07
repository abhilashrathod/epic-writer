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
  type StoryTime,
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
  type ProposalPayloads,
  type ProposalSummaryDto,
} from '@epic/schemas/proposals';
import { commitInSession, type Change } from './commit';
import { entityChange, takenSlugs, type PendingEntities } from './entities';
import { Conflict, DomainError, Invalid, NotFound } from './errors';
import { factChange } from './facts';
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
}

/** The codex extraction checks against: scrapped entries are left out (AGENTS.md rule 9). */
export async function extractionCodex(db: Db, ctx: ProjectContext): Promise<ExtractionCodex> {
  const [entries, types, linkTypes] = await Promise.all([
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'entityTypes', ctx.scope),
    readHeads(db, 'linkTypes', ctx.scope),
  ]);
  return {
    entries: entries.filter((e) => e.canonState !== 'scrapped'),
    types: types.sort((a, b) => a.order - b.order),
    linkTypes,
  };
}

// ---------- model output → proposed changes ----------

/** A model's string value as a field value, or undefined when it can't be one. */
function coerce(f: FieldDef, raw: string, resolveName: (name: string) => string | null): unknown {
  const v = raw.trim();
  if (!v) return undefined;
  switch (f.kind) {
    case 'text':
    case 'richtext':
      return v;
    case 'number': {
      const n = Number(v.replace(/,/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'enum':
      return f.options.find((o) => o.toLowerCase() === v.toLowerCase());
    case 'boolean':
      return /^(true|yes)$/i.test(v) ? true : /^(false|no)$/i.test(v) ? false : undefined;
    case 'entityRef':
      return resolveName(v) ?? undefined;
    default:
      // Dates, quantities and lists need more than a string; the writer adds them by hand.
      return undefined;
  }
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
  source: Pick<ExtractionSource, 'document' | 'scenes'>,
): ProposalChange[] {
  const typeByName = new Map<string, EntityTypeDoc>();
  for (const t of codex.types) {
    typeByName.set(normaliseName(t.pluralName), t);
    typeByName.set(normaliseName(t.name), t);
  }
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
  const push = <K extends ExtractOp>(
    op: K,
    payload: Record<string, unknown>,
    confidence: number,
    candidates: { key: string; score: number }[] = [],
  ) =>
    changes.push({
      op,
      payload: PROPOSAL_PAYLOADS[op].parse(payload) as Record<string, unknown>,
      confidence: Math.round(confidence * 100) / 100,
      matchCandidates: candidates,
      status: 'pending',
    });

  // Pass 2: entries.
  for (const { e, names, candidates, existing, type, ref } of decided) {
    const fields: Record<string, unknown> = {};
    for (const { field, value } of e.fields) {
      const f = fieldNamed(type, field);
      const v = f && coerce(f, value, resolveName);
      if (f && v !== undefined && v !== ref) fields[f.key] = v;
    }
    if (!existing) {
      push(
        'createEntity',
        {
          ref,
          typeKey: type.key,
          name: e.name,
          aliases: e.aliases.filter((a) => a.trim() && normaliseName(a) !== normaliseName(e.name)),
          summary: e.summary,
          fields,
          needsChoice: candidates.length > 0,
          quote: e.quote,
        },
        e.confidence,
        candidates,
      );
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
    for (const [field, value] of Object.entries(fields)) {
      if (JSON.stringify(existing.fields[field]) === JSON.stringify(value)) continue;
      push('updateField', { entity: existing.key, field, value, quote: e.quote }, e.confidence);
    }
  }

  // Facts happen at the document's story time (if set) and the scene the quote is in.
  const storyTime: StoryTime = source.document.storyTime ?? {
    start: 0,
    end: null,
    precision: 'unknown',
  };
  const placeOf = (quote: string) =>
    quote.trim() ? source.scenes.find((s) => s.text.includes(quote.trim()))?.ref : undefined;
  for (const f of out.facts) {
    const entity = resolveName(f.entry);
    const field = entity ? fieldNamed(typeOf(entity), f.field) : undefined;
    if (!entity || !field?.timeVarying) continue;
    const value = coerce(field, f.value, resolveName);
    if (value === undefined) continue;
    const at = placeOf(f.quote);
    push(
      'addFact',
      { entity, field: field.key, value, storyTime, narrativeRefs: at ? [at] : [], quote: f.quote },
      f.confidence,
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
  return changes;
}

/** Stores one extraction run's proposal (AGENTS.md rule 7: AI output never writes the codex). */
export function saveProposal(
  db: Db,
  ctx: ProjectContext,
  p: {
    jobId: ObjectId;
    source: ExtractionSource;
    changes: ProposalChange[];
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
    changes: p.changes.map((c, index) => ({ ...c, index, status: c.status as ChangeStatus })),
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
    }
    if (edit.status) {
      if (edit.status === 'accepted' && c.op === 'createEntity' && c.payload.needsChoice)
        throw new Invalid(
          `Choose whether "${String(c.payload.name)}" is a new entry or one you already have`,
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
  for (const { op, payload, index } of later) {
    const built = await blame(index, () => {
      if (op === 'addFact') {
        const pl = parse('addFact', payload);
        const raw = { ...pl, entityKey: resolve(pl.entity), value: resolveValue(pl.value) };
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
