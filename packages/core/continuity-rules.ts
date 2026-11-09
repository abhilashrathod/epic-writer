// Plain-code continuity rules (AI-6). Pure: no database, no AI. They run before the AI pass and
// catch what can be decided from the codex as of each scene.
//
// Each scene is checked "as of" its own point: story time = the scene's story time (tag), else
// the document's; narrative position = the scene's order in the work (`<orderPath>.<nnnn>`, the
// same order derived scenes get on save). Without a story time, date-based rules are skipped:
// we can't tell whether someone is dead yet.
//
// How a mention is used:
//   speaks  - the mention is a Fountain character cue.
//   acts    - action (or prose) where the mention is a sentence subject: it starts the sentence
//             and the next word starts in lower case ("Bhishma draws his bow").
//   mention - anything else (dialogue, "Bhishma's pyre", "they mourn Bhishma").
//
// Rules (one issue per rule, entry and scene, at the first offending mention):
//   dead-character-acts  An entry with the `born` trait that is dead as of the scene (death date
//                        reached, or a time-varying enum field whose value is "dead") speaks
//                        (error) or acts (warning).
//   timeline-clash       A `born` entry that isn't born yet as of the scene (birth date after the
//                        scene's story time) speaks or acts (error) or is mentioned (info).
//   item-not-held        A `holdable` entry used by someone other than its holder as of the scene.
//                        The holder is the field keyed `holderKey`, else the type's first
//                        time-varying entry-reference field. The user is the first `born` mention
//                        in the same sentence of action or prose (warning), or the cue's speaker
//                        when the item is named in dialogue (info). Items without a holder pass.
//   knowledge-leak       "Name used too early": the entry's first appearance in this work (from
//                        `firstAppearances`, recorded on save from mentions outside dialogue)
//                        comes after this scene, so naming it here gives it away early (warning).

import type { ContinuityRule, TextRange } from '@epic/db';
import {
  classifyLines,
  extractScenes,
  findMarkers,
  type LineType,
  type Marker,
  type TextFormat,
} from '@epic/fountain';
import { holderField, lifeAt, resolveFields, type AsOf } from './asof';
import type { StoryTimeShape } from './calendar';

export interface RuleType {
  key: string;
  name: string;
  traits: readonly string[];
  fields: { key: string; kind: string; timeVarying: boolean; options: string[] }[];
}
export interface RuleEntity {
  key: string;
  typeKey: string;
  name: string;
  fields: Record<string, unknown>;
  canonState: string;
  firstAppearances: { workKey: string; order: string }[];
}
export interface RuleFact {
  key: string;
  entityKey: string;
  field: string;
  value: unknown;
  storyTime: StoryTimeShape;
  narrativeRefs: { workKey: string; order: string }[];
  canonState: string;
}
export interface RuleWorld {
  types: RuleType[];
  entities: RuleEntity[];
  facts: RuleFact[];
}
export interface RuleDocument {
  text: string;
  format: TextFormat;
  workKey: string;
  orderPath: string;
  /** The document's story time (start day), or null if it has none. */
  storyTime: number | null;
  /** Story time per scene key, from scene tags; overrides the document's. */
  sceneTimes?: Record<string, number | null>;
}
export type Severity = 'info' | 'warning' | 'error';
export interface FoundIssue {
  sceneKey: string | null;
  range: TextRange;
  rule: ContinuityRule;
  severity: Severity;
  message: string;
  relatedKeys: string[];
}

type Use = 'speaks' | 'acts' | 'mention';
interface Scene {
  key: string | null;
  from: number;
  asOf: AsOf;
}

const pad = (n: number) => String(n).padStart(4, '0');
const SENTENCE_END = /[.!?]["')\]]*\s/g;

/** The sentence holding `pos` within a line, as [start, end). */
function sentenceAt(line: string, pos: number): [number, number] {
  let start = 0;
  for (const m of line.matchAll(SENTENCE_END)) {
    const end = m.index + m[0].length;
    if (end > pos) return [start, end];
    start = end;
  }
  return [start, line.length];
}

/** Whether a mention reads as the subject of its sentence (see the header). */
function isSubject(line: string, m: Marker): boolean {
  const before = line.slice(sentenceAt(line, m.from)[0], m.from);
  if (findMarkers(before).length || before.replace(/[\s"'(*_]/g, '') !== '') return false;
  return /^\s+\p{Ll}/u.test(line.slice(m.to));
}

/** Dead as of a point: death date reached, or a time-varying enum field set to "dead". */
export function isDead(type: RuleType, values: Record<string, unknown>, at: number): boolean {
  if (lifeAt(null, type.fields, values, at).status === 'dead') return true;
  return type.fields.some(
    (f) =>
      f.kind === 'enum' && f.timeVarying && f.options.includes('dead') && values[f.key] === 'dead',
  );
}

/** Runs every plain-code rule over one document's text. */
export function checkContinuityRules(doc: RuleDocument, world: RuleWorld): FoundIssue[] {
  const types = new Map(world.types.map((t) => [t.key, t]));
  const entities = new Map(
    world.entities.filter((e) => e.canonState !== 'scrapped').map((e) => [e.key, e]),
  );
  const factsBy = new Map<string, RuleFact[]>();
  for (const f of world.facts) {
    if (f.canonState === 'scrapped') continue;
    factsBy.set(f.entityKey, [...(factsBy.get(f.entityKey) ?? []), f]);
  }

  const asOf = (key: string | null, order: string): AsOf => ({
    storyTime: (key ? doc.sceneTimes?.[key] : null) ?? doc.storyTime,
    workKey: doc.workKey,
    order,
  });
  // Text before the first scene heading reads as the start of the document.
  const scenes: Scene[] = [{ key: null, from: 0, asOf: asOf(null, `${doc.orderPath}.0000`) }];
  extractScenes(doc.text, doc.format).forEach((s, i) =>
    scenes.push({ key: s.key, from: s.from, asOf: asOf(s.key, `${doc.orderPath}.${pad(i + 1)}`) }),
  );

  const cache = new Map<string, Record<string, unknown>>();
  const valuesAt = (e: RuleEntity, si: number) => {
    const id = `${e.key}@${si}`;
    let v = cache.get(id);
    if (!v)
      cache.set(id, (v = resolveFields(e.fields, factsBy.get(e.key) ?? [], scenes[si]!.asOf)));
    return v;
  };

  const out: FoundIssue[] = [];
  const seen = new Set<string>();
  const add = (si: number, entityKey: string, issue: Omit<FoundIssue, 'sceneKey'>) => {
    const id = `${issue.rule}|${entityKey}|${si}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ ...issue, sceneKey: scenes[si]!.key });
  };

  const lines = doc.text.split('\n');
  const lineTypes: LineType[] | null = doc.format === 'fountain' ? classifyLines(lines) : null;
  let si = 0;
  let offset = 0;
  let speaker: string | null = null;
  for (let n = 0; n < lines.length; offset += lines[n]!.length + 1, n++) {
    const line = lines[n]!;
    while (si + 1 < scenes.length && scenes[si + 1]!.from <= offset) si++;
    const lineType = lineTypes?.[n] ?? 'action';
    const mentions = findMarkers(line).filter((m) => m.kind === 'mention' && m.key);
    if (lineType === 'character') speaker = mentions[0]?.key ?? null;
    else if (lineType !== 'dialogue' && lineType !== 'parenthetical') speaker = null;
    if (!mentions.length) continue;

    const at = scenes[si]!.asOf.storyTime;
    const order = scenes[si]!.asOf.order!;
    const born = (k: string | undefined) => {
      const e = k ? entities.get(k) : undefined;
      return !!e && !!types.get(e.typeKey)?.traits.includes('born');
    };

    for (const m of mentions) {
      const e = entities.get(m.key!);
      const type = e && types.get(e.typeKey);
      if (!e || !type) continue;
      const range = { from: offset + m.from, to: offset + m.to };
      const use: Use =
        lineType === 'character'
          ? 'speaks'
          : lineType === 'action' && isSubject(line, m)
            ? 'acts'
            : 'mention';
      const verb = use === 'speaks' ? 'speaks' : use === 'acts' ? 'acts' : 'is named';

      if (type.traits.includes('born') && at !== null) {
        const values = valuesAt(e, si);
        if (use !== 'mention' && isDead(type, values, at)) {
          add(si, e.key, {
            range,
            rule: 'dead-character-acts',
            severity: use === 'speaks' ? 'error' : 'warning',
            message: `${e.name} ${verb} here, but is dead by this scene's point in the story. Move the scene before the death, change the death in the codex, or set this scene's story time if it's a flashback.`,
            relatedKeys: [e.key],
          });
        } else if (lifeAt(null, type.fields, values, at).status === 'unborn') {
          add(si, e.key, {
            range,
            rule: 'timeline-clash',
            severity: use === 'mention' ? 'info' : 'error',
            message: `${e.name} ${verb} here, but isn't born yet at this scene's story time. Check the birth date in the codex or the scene's story time.`,
            relatedKeys: [e.key],
          });
        }
      }

      const hf = type.traits.includes('holdable') ? holderField(type) : null;
      if (hf && at !== null) {
        const holder = valuesAt(e, si)[hf];
        const fromAction = lineType === 'action';
        const [start, end] = sentenceAt(line, m.from);
        const user = fromAction
          ? mentions.find((x) => x.from >= start && x.from < end && born(x.key))?.key
          : lineType === 'dialogue'
            ? speaker
            : null;
        if (typeof holder === 'string' && user && user !== holder) {
          const holderName = entities.get(holder)?.name ?? 'someone else';
          const userName = entities.get(user)?.name ?? 'Someone';
          add(si, e.key, {
            range,
            rule: 'item-not-held',
            severity: fromAction ? 'warning' : 'info',
            message: `${userName} ${fromAction ? 'uses' : 'speaks of using'} ${e.name}, but ${holderName} holds it at this point. Record a change of holder in the codex first, or give it to ${holderName} here.`,
            relatedKeys: [e.key, user, holder],
          });
        }
      }

      const first = e.firstAppearances
        .filter((r) => r.workKey === doc.workKey)
        .map((r) => r.order)
        .sort()[0];
      if (first !== undefined && order < first) {
        add(si, e.key, {
          range,
          rule: 'knowledge-leak',
          severity: 'warning',
          message: `${e.name} is named before their first appearance later in this work, which gives them away early. Cut or rename the mention, or have them appear in an earlier scene.`,
          relatedKeys: [e.key],
        });
      }
    }
  }
  return out;
}

/**
 * The text as the reader sees it (mentions as names, scene markers and notes removed), with a map
 * back to the stored text so AI quotes can be located. Each display character maps to the stored
 * range it came from; a mention's characters map to the whole marker.
 */
export function readableText(text: string): { display: string; from: number[]; to: number[] } {
  const from: number[] = [];
  const to: number[] = [];
  let display = '';
  let pos = 0;
  const plain = (end: number) => {
    for (; pos < end; pos++) {
      display += text[pos];
      from.push(pos);
      to.push(pos + 1);
    }
  };
  for (const m of findMarkers(text)) {
    plain(m.from);
    if (m.kind === 'mention') {
      for (const ch of m.name ?? '') {
        display += ch;
        from.push(m.from);
        to.push(m.to);
      }
    }
    pos = m.to;
  }
  plain(text.length);
  return { display, from, to };
}

/** Where a quote from the readable text sits in the stored text, or null if it isn't there. */
export function locateQuote(
  readable: ReturnType<typeof readableText>,
  quote: string,
): TextRange | null {
  const q = quote.trim();
  if (!q) return null;
  const at = readable.display.indexOf(q);
  if (at < 0) return null;
  return { from: readable.from[at]!, to: readable.to[at + q.length - 1]! };
}

/**
 * The single changed span between two texts (common prefix and suffix): `[from, oldTo)` in the old
 * text became `[from, newTo)`. Null when they're equal.
 */
export function changedSpan(
  oldText: string,
  newText: string,
): { from: number; oldTo: number; newTo: number } | null {
  if (oldText === newText) return null;
  const max = Math.min(oldText.length, newText.length);
  let from = 0;
  while (from < max && oldText.charCodeAt(from) === newText.charCodeAt(from)) from++;
  let tail = 0;
  while (
    tail < max - from &&
    oldText.charCodeAt(oldText.length - 1 - tail) === newText.charCodeAt(newText.length - 1 - tail)
  )
    tail++;
  return { from, oldTo: oldText.length - tail, newTo: newText.length - tail };
}

/**
 * A flagged range after an edit: unchanged before it, shifted after it, null (stale) when the edit
 * touches the flagged text itself.
 */
export function shiftRange(
  range: TextRange,
  span: { from: number; oldTo: number; newTo: number },
): TextRange | null {
  if (span.oldTo <= range.from) {
    const d = span.newTo - span.oldTo;
    return { from: range.from + d, to: range.to + d };
  }
  if (span.from >= range.to) return range;
  return null;
}
