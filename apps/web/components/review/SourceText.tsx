'use client';

import { useEffect, useMemo, useRef } from 'react';

interface Segment {
  text: string;
  /** Changes whose quote is this span. */
  changes: number[];
}

/** Splits `text` at the first occurrence of each quote. Overlapping quotes keep the earlier span. */
function segments(text: string, quotes: { index: number; quote: string }[]): Segment[] {
  const spans = new Map<string, { from: number; to: number; changes: number[] }>();
  for (const { index, quote } of quotes) {
    const q = quote.trim();
    const from = q ? text.indexOf(q) : -1;
    if (from < 0) continue;
    const id = `${from}:${q.length}`;
    const span = spans.get(id) ?? { from, to: from + q.length, changes: [] };
    span.changes.push(index);
    spans.set(id, span);
  }
  const out: Segment[] = [];
  let pos = 0;
  for (const s of [...spans.values()].sort((a, b) => a.from - b.from)) {
    if (s.from < pos) continue;
    if (s.from > pos) out.push({ text: text.slice(pos, s.from), changes: [] });
    out.push({ text: text.slice(s.from, s.to), changes: s.changes });
    pos = s.to;
  }
  out.push({ text: text.slice(pos), changes: [] });
  return out;
}

/** The source of a proposal with each change's quoted span highlighted; the active one inverts. */
export function SourceText(props: {
  text: string;
  quotes: { index: number; quote: string }[];
  active: number | null;
}) {
  const parts = useMemo(() => segments(props.text, props.quotes), [props.text, props.quotes]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.active === null) return;
    root.current
      ?.querySelector(`[data-changes~="${props.active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [props.active]);
  if (!props.text.trim())
    return <p className="text-sm text-muted">The source text is empty or was deleted.</p>;
  return (
    <div ref={root} className="whitespace-pre-wrap font-script text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.changes.length ? (
          <mark
            key={i}
            data-changes={p.changes.join(' ')}
            className={`rounded-sm px-0.5 ${
              props.active !== null && p.changes.includes(props.active)
                ? 'bg-selected text-on-selected'
                : 'bg-warn-soft text-ink'
            }`}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </div>
  );
}
