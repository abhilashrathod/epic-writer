import type { Db } from 'mongodb';
import { jobs, proposals, readHeads } from '@epic/db';
import type { ImportedNoteDto, ImportStatusDto } from '@epic/schemas/import';
import { enqueueAiJob } from './ai';
import { Invalid } from './errors';
import { saveWorkingText } from './save';
import { createDocument, createWork, type ProjectContext } from './works';

/** IO-1: the work imported notes live in, one note document per file (or part of a file). */
export const IMPORTED_NOTES_WORK = 'Imported notes';
/** Longer notes are split so each extraction run reads a sensible amount of text. */
export const NOTE_PART_CHARS = 18_000;

const isHeading = (block: string) => /^#{1,6}\s/.test(block);

/** Packs `pieces` joined by `sep` into chunks of at most `max` characters. */
function pack(
  pieces: string[],
  sep: string,
  max: number,
  breakBefore: (piece: string, cur: string) => boolean = () => false,
) {
  const out: string[] = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && (cur.length + sep.length + p.length > max || breakBefore(p, cur))) {
      out.push(cur);
      cur = p;
    } else cur = cur ? cur + sep + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Splits a block with no blank lines at line ends, and over-long lines at `max`. */
function splitBlock(block: string, max: number): string[] {
  const lines = block
    .split('\n')
    .flatMap((l) => (l.length <= max ? [l] : (l.match(new RegExp(`.{1,${max}}`, 'g')) ?? [])));
  return pack(lines, '\n', max);
}

/**
 * Splits note text into parts of at most `max` characters at paragraph boundaries, starting a new
 * part at a Markdown heading once the current part is half full. Short text stays one part.
 */
export function splitNote(text: string, max = NOTE_PART_CHARS): string[] {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const blocks = clean
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => (b.length <= max ? [b] : splitBlock(b, max)));
  return pack(blocks, '\n\n', max, (b, cur) => isHeading(b) && cur.length >= max / 2);
}

const titleOf = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim() || 'Untitled note';

async function findNotesWork(db: Db, ctx: ProjectContext): Promise<string | null> {
  const works = await readHeads(db, 'works', ctx.scope);
  return works.find((w) => w.name === IMPORTED_NOTES_WORK && w.medium === 'other')?.key ?? null;
}

/**
 * Imports note files already turned into text: each becomes one note document (or several, for
 * long notes) in the "Imported notes" work, which is created on first import.
 */
export async function importNotes(
  db: Db,
  ctx: ProjectContext,
  files: { name: string; text: string }[],
): Promise<{ workKey: string; documents: { key: string; title: string }[] }> {
  const parsed = files.map((f) => ({ title: titleOf(f.name), parts: splitNote(f.text) }));
  const empty = files.find((_, i) => !parsed[i]!.parts.length);
  if (empty) throw new Invalid(`"${empty.name}" has no text to import`);

  const workKey =
    (await findNotesWork(db, ctx)) ??
    (await createWork(db, ctx, { name: IMPORTED_NOTES_WORK, medium: 'other' }));
  const documents: { key: string; title: string }[] = [];
  for (const { title, parts } of parsed) {
    for (const [i, text] of parts.entries()) {
      const docTitle = parts.length > 1 ? `${title} (part ${i + 1})` : title;
      const key = await createDocument(db, ctx, {
        workKey,
        parentKey: null,
        title: docTitle,
        contentType: 'note',
      });
      await saveWorkingText(db, ctx, { documentKey: key, text, baseVersion: 0 });
      documents.push({ key, title: docTitle });
    }
  }
  return { workKey, documents };
}

/** Each imported note with where it is in extraction and review, and what extraction cost. */
export async function importStatus(db: Db, ctx: ProjectContext): Promise<ImportStatusDto> {
  const workKey = await findNotesWork(db, ctx);
  if (!workKey) return { workKey: null, notes: [], costMicros: 0 };
  const docs = (await readHeads(db, 'documents', ctx.scope, { workKey }))
    .filter((d) => d.kind === 'text')
    .sort((a, b) => a.orderPath.localeCompare(b.orderPath));
  const documentKeys = docs.map((d) => d.key);
  const [runs, props] = await Promise.all([
    jobs.listForDocuments(db, { ...ctx.scope, type: 'extract', documentKeys }),
    proposals.listForDocuments(db, { ...ctx.scope, documentKeys }),
  ]);

  let cost = 0;
  let costKnown = true;
  for (const j of runs) {
    if (j.status !== 'done') continue;
    cost += j.costMicros;
    if (j.output.costKnown === false) costKnown = false;
  }

  const notes = docs.map((d): ImportedNoteDto => {
    const last = runs.find((j) => j.input.documentKey === d.key);
    const mine = props.filter((p) => p.source.documentKey === d.key);
    const open = (p: (typeof mine)[number]) =>
      p.changes.filter((c) => c.status === 'pending' || c.status === 'accepted').length;
    const pending = mine.reduce((n, p) => n + open(p), 0);
    const next = mine.find((p) => open(p) > 0) ?? mine[0];
    const state: ImportedNoteDto['state'] =
      last?.status === 'queued' || last?.status === 'running'
        ? 'extracting'
        : mine.length
          ? pending
            ? 'review'
            : 'reviewed'
          : last?.status === 'failed'
            ? 'failed'
            : 'new';
    return {
      documentKey: d.key,
      title: d.title,
      state,
      error: state === 'failed' ? (last?.error ?? null) : null,
      pending,
      proposalId: next?._id.toHexString() ?? null,
    };
  });
  return { workKey, notes, costMicros: costKnown ? cost : null };
}

/**
 * Queues one extraction run (the same `extract` job as the editor's) for every imported note that
 * has none yet or whose last run failed. Runs only on request; the worker works through the queue.
 */
export async function extractImportedNotes(
  db: Db,
  ctx: ProjectContext,
): Promise<{ queued: number }> {
  const { notes } = await importStatus(db, ctx);
  const todo = notes.filter((n) => n.state === 'new' || n.state === 'failed');
  if (!todo.length) throw new Invalid('Every imported note has been extracted already');
  for (const n of todo) {
    await enqueueAiJob(db, ctx, 'extract', {
      documentKey: n.documentKey,
      userId: ctx.userId.toHexString(),
    });
  }
  return { queued: todo.length };
}
