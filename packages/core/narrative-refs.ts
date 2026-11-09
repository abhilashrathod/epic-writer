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

const toTarget = (index: NarrativeIndex, d: Doc, s: Scene | null): NarrativeTarget => ({
  ref: {
    workKey: d.workKey,
    documentKey: d.key,
    sceneKey: s?.sceneKey ?? null,
    order: s?.order ?? d.orderPath,
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
  const leaves = (scope ?? docs).filter((d) => d.kind === 'text');
  if (sceneNumber === null) return leaves.map((d) => toTarget(index, d, null));
  return leaves.flatMap((d) => {
    const s = scenesOf(index, d.key)[sceneNumber! - 1];
    return s ? [toTarget(index, d, s)] : [];
  });
}

/**
 * Finds the place a piece of text names: an episode or chapter title, a scene heading, an order
 * path, or shorthand in the work's level names. A title, heading or path wins over shorthand. Text
 * that fits more than one place comes back ambiguous, for the writer to choose; only containers
 * are never a target, since a season has no single point in the story.
 */
export function resolveNarrativeRef(
  text: string,
  index: NarrativeIndex,
  workKey?: string,
): NarrativeResolution {
  const q = norm(text);
  if (!q) return { status: 'unresolved' };
  const inWork = (k: string) => !workKey || k === workKey;
  const docs = index.documents.filter((d) => d.kind === 'text' && inWork(d.workKey));
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
 * The reference with its work and order taken from its keys, or null when its episode or scene no
 * longer exists. Label-only items pass through.
 */
export function canonicalNarrativeRef(
  r: NarrativeRefValue,
  index: NarrativeIndex,
): NarrativeRefValue | null {
  if (needsSceneLink(r)) return r;
  const d = index.documents.find((x) => x.key === r.documentKey && x.kind === 'text');
  if (!d) return null;
  const s = r.sceneKey ? scenesOf(index, d.key).find((x) => x.sceneKey === r.sceneKey) : null;
  if (r.sceneKey && !s) return null;
  return { ...r, workKey: d.workKey, order: s?.order ?? d.orderPath };
}

/** Order changes when scenes or episodes move, so the keys are preferred over the stored order. */
function currentOrder(r: NarrativeRefValue, index?: NarrativeIndex): string | null {
  if (!index) return r.order;
  return (
    index.scenes.find((s) => s.sceneKey === r.sceneKey)?.order ??
    index.documents.find((d) => d.key === r.documentKey)?.orderPath ??
    r.order
  );
}

/**
 * Whether a reference may be shown as of a point. A label, or a place in another work, can't be
 * compared with the point and could be a spoiler, so it stays out until the end of the story.
 */
export function narrativeRefReached(
  r: NarrativeRefValue,
  asOf: AsOf,
  index?: NarrativeIndex,
): boolean {
  if (!asOf.workKey || asOf.order === null) return true;
  const order = currentOrder(r, index);
  return r.workKey === asOf.workKey && order !== null && order <= asOf.order;
}

/** A reference in words, with its label after the place when it has both. */
export function describeNarrativeRef(r: NarrativeRefValue, index?: NarrativeIndex): string {
  const d = index?.documents.find((x) => x.key === r.documentKey);
  const s = d ? index!.scenes.find((x) => x.sceneKey === r.sceneKey) : undefined;
  const place = d ? targetText(index!, d, s ?? null) : null;
  if (place) return r.label ? `${place} (${r.label})` : place;
  return r.label ?? r.order ?? '';
}
