import { createHash } from 'node:crypto';
import { ObjectId, type ClientSession, type Db } from 'mongodb';
import {
  continuityIssues,
  projects,
  readHeads,
  scenes,
  type ContinuityIssueDoc,
  type DocumentDoc,
  type NewContinuityIssue,
} from '@epic/db';
import { extractScenes, findMarkers } from '@epic/fountain';
import type { ContinuityIssueDto } from '@epic/schemas/continuity';
import { resolveFields, timedStatus, type AsOf } from './asof';
import {
  changedSpan,
  checkContinuityRules,
  locateQuote,
  readableText,
  shiftRange,
  type FoundIssue,
  type RuleWorld,
} from './continuity-rules';
import { NotFound } from './errors';
import { worldSnapshot } from './facts';
import { getWorkingText, type ProjectContext } from './works';

export interface ContinuityRun {
  document: DocumentDoc;
  text: string;
  textHash: string;
  checkedSeq: number;
  /** Issues found by the plain-code rules. */
  found: FoundIssue[];
  /** A compact codex as of the document, for the AI pass. Scrapped data is left out. */
  context: string;
}

const MAX_CONTEXT_ENTRIES = 60;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Loads a document and its world and runs the plain-code rules (AI-6). The AI pass then works
 * from `text` and `context`. Reads only; nothing is written.
 */
export async function prepareContinuity(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
): Promise<ContinuityRun> {
  const { document, text } = await getWorkingText(db, ctx, documentKey);
  const [world, types, linkTypes, sceneRows, project] = await Promise.all([
    worldSnapshot(db, ctx),
    readHeads(db, 'entityTypes', ctx.scope),
    readHeads(db, 'linkTypes', ctx.scope),
    scenes.listForDocument(db, { ...ctx.scope, documentKey }),
    projects.findById(db, ctx.project._id),
  ]);
  const ruleWorld: RuleWorld = { types, entities: world.entities, facts: world.facts };
  const sceneTimes = Object.fromEntries(
    sceneRows.map((s) => [s.sceneKey, s.storyTime?.start ?? null]),
  );
  const found = checkContinuityRules(
    {
      text,
      format: document.format,
      workKey: document.workKey,
      orderPath: document.orderPath,
      storyTime: document.storyTime?.start ?? null,
      sceneTimes,
    },
    ruleWorld,
  );

  // Context: entries mentioned in the text, resolved as of the end of this document.
  const asOf: AsOf = {
    storyTime: document.storyTime?.start ?? null,
    workKey: document.workKey,
    order: `${document.orderPath}.9999`,
  };
  const mentioned = new Set(
    findMarkers(text).flatMap((m) => (m.key && m.kind === 'mention' ? [m.key] : [])),
  );
  const byKey = new Map(world.entities.map((e) => [e.key, e]));
  const typeBy = new Map(types.map((t) => [t.key, t]));
  const entries = world.entities.filter((e) => mentioned.has(e.key)).slice(0, MAX_CONTEXT_ENTRIES);
  const lines = entries.map((e) => {
    const type = typeBy.get(e.typeKey);
    const values = resolveFields(
      e.fields,
      world.facts.filter((f) => f.entityKey === e.key),
      asOf,
    );
    const shown = (type?.fields ?? []).flatMap((f) => {
      const v = values[f.key];
      if (v === null || v === undefined || v === '') return [];
      if (f.kind === 'entityRef' && typeof v === 'string')
        return [`${f.label}: ${byKey.get(v)?.name ?? '?'}`];
      if (typeof v === 'string' || typeof v === 'number')
        return [`${f.label}: ${clip(String(v), 160)}`];
      if (f.kind === 'date' && typeof v === 'object' && 'start' in v)
        return [`${f.label}: day ${String(v.start)}`];
      return [];
    });
    const aliases = e.aliases.length ? ` (also ${e.aliases.join(', ')})` : '';
    const summary = e.summary ? ` ${clip(e.summary, 240)}` : '';
    return `- [${e.key}] ${e.name}${aliases}, ${type?.name ?? 'entry'}.${summary}${shown.length ? ` ${shown.join('; ')}.` : ''}`;
  });
  const labels = new Map(linkTypes.map((l) => [l.key, l.label]));
  const linkLines = world.links
    .filter(
      (l) => mentioned.has(l.fromKey) && mentioned.has(l.toKey) && timedStatus(l, asOf) === 'past',
    )
    .slice(0, 120)
    .map(
      (l) =>
        `- ${byKey.get(l.fromKey)?.name} ${labels.get(l.typeKey) ?? l.kind} ${byKey.get(l.toKey)?.name}`,
    );
  const context = [
    'Entries mentioned (as of this episode):',
    ...(lines.length ? lines : ['- none']),
    'Connections:',
    ...(linkLines.length ? linkLines : ['- none']),
  ].join('\n');

  return {
    document,
    text,
    textHash: hashText(text),
    checkedSeq: project?.seqCounter ?? 0,
    found,
    context,
  };
}

/** An issue the AI pass reported, located by its quote. */
export interface QuotedIssue {
  rule: FoundIssue['rule'];
  severity: FoundIssue['severity'];
  quote: string;
  message: string;
  relatedKeys: string[];
}

/**
 * Maps AI issues back onto the stored text. Issues whose quote isn't in the text are dropped, and
 * related keys are kept only for entries in the context.
 */
export function locateQuotedIssues(run: ContinuityRun, issues: QuotedIssue[]): FoundIssue[] {
  const readable = readableText(run.text);
  const scenesIn = extractScenes(run.text, run.document.format);
  const known = new Set(run.context.match(/(?<=\[)[\w-]+(?=\])/g) ?? []);
  return issues.flatMap((i) => {
    const range = locateQuote(readable, i.quote);
    if (!range) return [];
    return [
      {
        sceneKey: scenesIn.findLast((s) => s.from <= range.from)?.key ?? null,
        range,
        rule: i.rule,
        severity: i.severity,
        message: i.message,
        relatedKeys: i.relatedKeys.filter((k) => known.has(k)),
      },
    ];
  });
}

export const hashText = (text: string) => createHash('sha256').update(text).digest('hex');

const sameIssue = (
  a: { rule: string; range: { from: number; to: number } | null },
  b: FoundIssue,
) => a.rule === b.rule && a.range?.from === b.range.from && a.range?.to === b.range.to;

/**
 * Replaces a document's issues with a run's results. An issue the writer dismissed stays
 * dismissed when the same rule flags the same text again; dismissed issues that didn't recur go.
 */
export async function storeContinuityRun(
  db: Db,
  ctx: ProjectContext,
  run: Pick<ContinuityRun, 'document' | 'textHash' | 'checkedSeq'>,
  issues: FoundIssue[],
): Promise<{ open: number; dismissed: number }> {
  const where = { ...ctx.scope, documentKey: run.document.key };
  const dismissed = await continuityIssues.listForDocument(db, where, ['dismissed']);
  const keep = dismissed.filter((d) => issues.some((i) => sameIssue(d, i)));
  const rows: NewContinuityIssue[] = issues
    .filter((i) => !keep.some((d) => sameIssue(d, i)))
    .map((i) => ({
      ...where,
      workKey: run.document.workKey,
      sceneKey: i.sceneKey,
      range: i.range,
      rule: i.rule,
      severity: i.severity,
      message: i.message,
      relatedKeys: i.relatedKeys,
      checkedSeq: run.checkedSeq,
      checkedTextHash: run.textHash,
      status: 'open',
    }));
  const session = db.client.startSession();
  try {
    await session.withTransaction(() =>
      continuityIssues.replaceForDocument(
        db,
        where,
        keep.map((d) => d._id),
        rows,
        { session },
      ),
    );
  } finally {
    await session.endSession();
  }
  return { open: rows.length, dismissed: keep.length };
}

/** A document's open and stale issues in text order, with the text each one flags. */
export async function listIssues(
  db: Db,
  ctx: ProjectContext,
  documentKey: string,
): Promise<ContinuityIssueDto[]> {
  const { text } = await getWorkingText(db, ctx, documentKey);
  const rows = await continuityIssues.listForDocument(db, { ...ctx.scope, documentKey }, [
    'open',
    'stale',
  ]);
  return rows.map((r) => ({
    id: r._id.toHexString(),
    rule: r.rule,
    severity: r.severity,
    message: r.message,
    relatedKeys: r.relatedKeys,
    sceneKey: r.sceneKey,
    range: r.range,
    quote: r.range && r.status === 'open' ? text.slice(r.range.from, r.range.to) : '',
    status: r.status,
  }));
}

export async function dismissIssue(db: Db, ctx: ProjectContext, id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new NotFound('Issue not found');
  const where = { ...ctx.scope, id: new ObjectId(id) };
  if (!(await continuityIssues.findById(db, where))) throw new NotFound('Issue not found');
  await continuityIssues.setStatus(db, where, 'dismissed');
}

/**
 * Keeps issues in step with a save without re-running checks (AI-7): ranges after the edit shift,
 * and open issues whose flagged text was edited become stale. Dismissed issues only shift. The
 * edit is found as one changed span (common prefix and suffix), so two edits far apart in one
 * save also stale issues between them; saves are frequent, so that is rare.
 */
export async function markStaleOnSave(
  db: Db,
  issues: ContinuityIssueDoc[],
  oldText: string,
  newText: string,
  opts: { session?: ClientSession } = {},
): Promise<void> {
  const span = changedSpan(oldText, newText);
  if (!span) return;
  type Edit = Parameters<typeof continuityIssues.applyEdits>[1][number];
  const edits = issues.flatMap((i): Edit[] => {
    if (!i.range) return [];
    const range = shiftRange(i.range, span);
    if (range && range.from === i.range.from) return [];
    if (range) return [{ id: i._id, range, status: i.status }];
    if (i.status === 'dismissed') return [{ id: i._id, range: null, status: i.status }];
    return [{ id: i._id, range: i.range, status: 'stale' }];
  });
  await continuityIssues.applyEdits(db, edits, opts);
}
