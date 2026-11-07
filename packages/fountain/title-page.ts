// A Fountain title page is `Key: value` lines at the very top of the file, ending at the first
// blank line. Values may continue on lines indented by three spaces or a tab.

export interface TitlePage {
  /** The `Title` value with emphasis marks removed, or null when there is none. */
  title: string | null;
  /** Every key, lower-cased, with continuation lines joined by `\n`. */
  fields: Record<string, string>;
  /** The script after the title page and the blank lines that follow it. */
  body: string;
}

const KEY_RE = /^([A-Za-z][A-Za-z ]*):[ \t]*(.*)$/;
const CONTINUATION_RE = /^(?: {3}|\t)\s*\S/;

/** Splits a Fountain title page from the script. Text without one comes back unchanged as `body`. */
export function splitTitlePage(text: string): TitlePage {
  const none: TitlePage = { title: null, fields: {}, body: text };
  const blank = /\n[ \t]*\n/.exec(text);
  const block = blank ? text.slice(0, blank.index) : text;
  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const line of block.split('\n')) {
    const m = KEY_RE.exec(line);
    // `CUT TO:` at the top is a transition, not a title page key.
    if (m && !/ TO$/.test(m[1]!)) {
      current = m[1]!.trim().toLowerCase();
      fields[current] = m[2]!.trim();
    } else if (current && CONTINUATION_RE.test(line)) {
      fields[current] = [fields[current], line.trim()].filter(Boolean).join('\n');
    } else return none;
  }
  const body = blank ? text.slice(blank.index + 1).replace(/^(?:[ \t]*\n)+/, '') : '';
  const title = (fields.title ?? '')
    .replace(/[*_]/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  return { title: title || null, fields, body };
}
