// Identity resolution (AI-5): matching a name from the text to entries the codex already has.

/** At or above this score a name is taken to be that entry; below it the writer must choose. */
export const STRONG_MATCH = 0.9;
/** Below this score an entry isn't offered as a candidate at all. */
export const WEAK_MATCH = 0.6;

export interface NamedEntry {
  key: string;
  name: string;
  aliases: string[];
}

/** Lowercase, no accents or punctuation, no leading article: "The Kingslayer" → "kingslayer". */
export function normaliseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * How likely two names name the same thing, 0 to 1. Equal after normalising is 1. One name being
 * all the words of the other ("Arjuna" in "Arjuna Pandava") is 0.8: likely, but worth asking.
 * Otherwise spelling similarity, so "Arjun" and "Arjuna" score about 0.83.
 */
export function nameScore(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const longWords = new Set(long.split(' '));
  const shortWords = short.split(' ');
  if (short.length >= 3 && shortWords.every((w) => longWords.has(w))) return 0.8;
  return 1 - editDistance(x, y) / long.length;
}

/**
 * Existing entries a mention could be, best first, each scored by its closest name or alias.
 * Entries below WEAK_MATCH are left out.
 */
export function matchCandidates(
  names: string[],
  entries: readonly NamedEntry[],
  limit = 3,
): { key: string; score: number }[] {
  const out: { key: string; score: number }[] = [];
  for (const e of entries) {
    let best = 0;
    for (const n of names)
      for (const m of [e.name, ...e.aliases]) best = Math.max(best, nameScore(n, m));
    if (best >= WEAK_MATCH) out.push({ key: e.key, score: Math.round(best * 100) / 100 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
