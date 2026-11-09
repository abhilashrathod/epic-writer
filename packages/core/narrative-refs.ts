// Pure rules for places in a work, safe for the browser: import from '@epic/core/narrative-refs'.

import type { NarrativeRefValue } from '@epic/schemas/entity-fields';
import type { AsOf } from './asof';

export interface NarrativeIndex {
  works: {
    key: string;
    name: string;
    levels: { key: string; singular: string; plural: string }[];
  }[];
  documents: {
    key: string;
    workKey: string;
    levelKey: string;
    kind: 'container' | 'text';
    title: string;
    number: number;
    orderPath: string;
  }[];
  scenes: { sceneKey: string; documentKey: string; heading: string; order: string }[];
}

type Work = NarrativeIndex['works'][number];
type Doc = NarrativeIndex['documents'][number];
type Scene = NarrativeIndex['scenes'][number];

export interface NarrativeTarget {
  ref: NarrativeRefValue;
  target: string;
}
export type NarrativeResolution =
  | ({ status: 'resolved' } & NarrativeTarget)
  | { status: 'ambiguous'; options: NarrativeTarget[] }
  | { status: 'unresolved' };

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const SHORTHAND = /^(?:[\s,;:/·-]*\p{L}+\.?\s*\d+)+[\s,;:/·-]*$/u;
const PART = /(\p{L}+)\.?\s*(\d+)/gu;
const SCENE_WORD = /^sc(ene)?$/;

export const isNarrativeRefKind = (kind: string) =>
  kind === 'narrativeRef' || kind === 'narrativeRefList';

const scenesOf = (index: NarrativeIndex, documentKey: string) =>
  index.scenes
    .filter((s) => s.documentKey === documentKey)
    .sort((a, b) => a.order.localeCompare(b.order));

function docName(index: NarrativeIndex, d: Doc): string {
  if (d.title.trim()) return d.title.trim();
  const level = index.works
    .find((w) => w.key === d.workKey)
    ?.levels.find((l) => l.key === d.levelKey);
  return `${level?.singular ?? 'Part'} ${d.number}`;
}

/** Where a place is, in words: its work (if there are several), its path, then its scene. */
function targetText(index: NarrativeIndex, d: Doc, s: Scene | null): string {
  const path = index.documents
    .filter(
      (x) =>
        x.workKey === d.workKey && (x.key === d.key || d.orderPath.startsWith(`${x.orderPath}.`)),
    )
    .sort((a, b) => a.orderPath.localeCompare(b.orderPath))
    .map((x) => docName(index, x));
  if (s) path.push(`Sc ${scenesOf(index, d.key).indexOf(s) + 1}: ${s.heading}`);
  const work = index.works.length > 1 && index.works.find((w) => w.key === d.workKey);
  return `${work ? `${work.name}: ` : ''}${path.join(' › ')}`;
}

/**
 * Where a reference to a whole document counts. A container counts at its last scene, so it never
 * reveals early; with nothing written yet, at its last episode or past anything inside it.
 */
function endOf(index: NarrativeIndex, d: Doc): string {
  if (d.kind === 'text') return d.orderPath;
  const last = index.documents
    .filter(
      (x) =>
        x.workKey === d.workKey && x.kind === 'text' && x.orderPath.startsWith(`${d.orderPath}.`),
    )
    .sort((a, b) => b.orderPath.localeCompare(a.orderPath))[0];
  if (!last) return `${d.orderPath}.9999`;
  return scenesOf(index, last.key).at(-1)?.order ?? last.orderPath;
}

const toTarget = (index: NarrativeIndex, d: Doc, s: Scene | null): NarrativeTarget => ({
  ref: {
    workKey: d.workKey,
    documentKey: d.key,
    sceneKey: s?.sceneKey ?? null,
    order: s?.order ?? endOf(index, d),
  },
  target: targetText(index, d, s),
});

/** Reads "S01E02", "S1 E2 sc 14" or "Book 1 ch 4" through one work's own level names. */
function byShorthand(index: NarrativeIndex, work: Work, q: string): NarrativeTarget[] {
  const docs = index.documents.filter((d) => d.workKey === work.key);
  const parts = [...q.matchAll(PART)];
  let scope = null as Doc[] | null;
  let lastLevel = -1;
  let sceneNumber: number | null = null;
  for (const [i, part] of parts.entries()) {
    const word = part[1]!;
    const n = Number(part[2]);
    const level = work.levels.findIndex(
      (l, at) =>
        at > lastLevel && (norm(l.singular).startsWith(word) || norm(l.plural).startsWith(word)),
    );
    if (level >= 0) {
      const within = scope;
      const levelKey = work.levels[level]!.key;
      scope = docs.filter(
        (d) =>
          d.levelKey === levelKey &&
          d.number === n &&
          (!within || within.some((p) => d.orderPath.startsWith(`${p.orderPath}.`))),
      );
      lastLevel = level;
    } else if (SCENE_WORD.test(word) && i === parts.length - 1) {
      sceneNumber = n;
    } else return [];
  }
  if (sceneNumber === null) return (scope ?? []).map((d) => toTarget(index, d, null));
  const leaves = (scope ?? docs).filter((d) => d.kind === 'text');
  return leaves.flatMap((d) => {
    const s = scenesOf(index, d.key)[sceneNumber! - 1];
    return s ? [toTarget(index, d, s)] : [];
  });
}

/**
 * Finds the place a piece of text names: an episode or chapter title, a scene heading, an order
 * path, or shorthand in the work's level names. A title, heading or path wins over shorthand. Text
 * that fits more than one place comes back ambiguous, for the writer to choose.
 */
export function resolveNarrativeRef(
  text: string,
  index: NarrativeIndex,
  workKey?: string,
): NarrativeResolution {
  const q = norm(text);
  if (!q) return { status: 'unresolved' };
  const inWork = (k: string) => !workKey || k === workKey;
  const docs = index.documents.filter((d) => inWork(d.workKey));
  const docOf = new Map(docs.map((d) => [d.key, d]));
  const named = [
    ...docs
      .filter((d) => norm(d.title) === q || d.orderPath === q)
      .map((d) => toTarget(index, d, null)),
    ...index.scenes
      .filter((s) => docOf.has(s.documentKey) && (norm(s.heading) === q || s.order === q))
      .map((s) => toTarget(index, docOf.get(s.documentKey)!, s)),
  ];
  const found =
    named.length || !SHORTHAND.test(q)
      ? named
      : index.works.filter((w) => inWork(w.key)).flatMap((w) => byShorthand(index, w, q));
  if (found.length === 0) return { status: 'unresolved' };
  return found.length === 1
    ? { status: 'resolved', ...found[0]! }
    : { status: 'ambiguous', options: found };
}

/** A field's value as a list. Text items, from a field not yet migrated, count as labels. */
export function narrativeItems(raw: unknown): NarrativeRefValue[] {
  if (raw === null || raw === undefined) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((item) =>
    typeof item === 'string' ? labelOnlyRef(item) : (item as NarrativeRefValue),
  );
}

export const labelOnlyRef = (label: string): NarrativeRefValue => ({
  workKey: null,
  documentKey: null,
  sceneKey: null,
  order: null,
  label,
});

export const needsSceneLink = (r: NarrativeRefValue) => r.documentKey === null;

/**
 * The order a reference's keys put it at now. A scene that has since gone keeps its number under
 * its episode's current path; a reference whose episode has gone keeps what it had.
 */
export function currentNarrativeOrder(r: NarrativeRefValue, index: NarrativeIndex): string | null {
  const d = index.documents.find((x) => x.key === r.documentKey);
  if (!d) return r.order;
  if (!r.sceneKey) return endOf(index, d);
  const s = index.scenes.find((x) => x.sceneKey === r.sceneKey && x.documentKey === d.key);
  return s?.order ?? `${d.orderPath}.${r.order?.split('.').pop()}`;
}

/**
 * The reference with its work and order taken from its keys, or null when its episode or scene no
 * longer exists. Label-only items pass through.
 */
export function canonicalNarrativeRef(
  r: NarrativeRefValue,
  index: NarrativeIndex,
): NarrativeRefValue | null {
  if (needsSceneLink(r)) return r;
  const d = index.documents.find((x) => x.key === r.documentKey);
  if (!d) return null;
  if (r.sceneKey && !index.scenes.some((x) => x.sceneKey === r.sceneKey && x.documentKey === d.key))
    return null;
  return { ...r, workKey: d.workKey, order: currentNarrativeOrder(r, index) };
}

/**
 * Whether a reference may be shown as of a point. A label, or a place in another work, can't be
 * compared with the point and could be a spoiler, so it stays out until the end of the story.
 */
export function narrativeRefReached(r: NarrativeRefValue, asOf: AsOf): boolean {
  if (!asOf.workKey || asOf.order === null) return true;
  return r.workKey === asOf.workKey && r.order !== null && r.order <= asOf.order;
}

/** A reference in words, with its label after the place when it has both. */
export function describeNarrativeRef(r: NarrativeRefValue, index?: NarrativeIndex): string {
  const d = index?.documents.find((x) => x.key === r.documentKey);
  const s = d ? index!.scenes.find((x) => x.sceneKey === r.sceneKey) : undefined;
  const place = d ? targetText(index!, d, s ?? null) : null;
  if (place) return r.label ? `${place} (${r.label})` : place;
  return r.label ?? r.order ?? '';
}
