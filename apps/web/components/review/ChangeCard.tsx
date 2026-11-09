'use client';

import { useState, type FormEvent } from 'react';
import type { ProposalChangeDto } from '@epic/schemas/proposals';
import { Button, Field } from '@epic/ui';

/** Display names for the keys and refs a change points at. */
export interface ReviewNames {
  entry: (ref: unknown) => string;
  type: (typeKey: unknown) => string;
  field: (entryRef: unknown, field: unknown) => string;
  link: (typeKey: unknown) => string;
  value: (v: unknown) => string;
}

export type ChangeEdit = {
  status?: 'pending' | 'accepted' | 'rejected';
  payload?: Record<string, unknown>;
};

const OP_LABEL: Record<string, string> = {
  createEntity: 'New entry',
  addAlias: 'New alias',
  updateField: 'Field',
  addFact: 'Change over time',
  createLink: 'New connection',
};

/** Payload text fields the writer can edit, per op. */
const FLAG_TEXT: Record<string, string> = {
  'quote-not-found': 'Quote not found',
  'value-not-in-choices': 'Value not in choices',
  'no-anchor': 'No scene or story time',
};
const NOT_IN_CHOICES = 'value-not-in-choices';

const EDITABLE: Record<string, { key: string; label: string }[]> = {
  createEntity: [
    { key: 'name', label: 'Name' },
    { key: 'summary', label: 'Summary' },
  ],
  addAlias: [{ key: 'alias', label: 'Alias' }],
  createLink: [{ key: 'note', label: 'Note' }],
};

function summary(c: ProposalChangeDto, n: ReviewNames): string {
  const p = c.payload;
  switch (c.op) {
    case 'createEntity':
      return `${n.type(p.typeKey)} “${String(p.name)}”`;
    case 'addAlias':
      return `“${String(p.alias)}” for ${n.entry(p.entity)}`;
    case 'updateField':
    case 'addFact':
      return `${n.entry(p.entity)}: ${n.field(p.entity, p.field)} → ${n.value(p.value)}`;
    case 'createLink':
      return `${n.entry(p.from)} ${n.link(p.typeKey)} ${n.entry(p.to)}`;
    default:
      return c.op;
  }
}

/** One proposed change (AI-4) with its confidence, identity choice (AI-5), and accept/reject/edit. */
export function ChangeCard(props: {
  change: ProposalChangeDto;
  names: ReviewNames;
  busy: boolean;
  onPatch: (edit: ChangeEdit) => void;
  onActive: (active: boolean) => void;
}) {
  const { change: c, names } = props;
  const p = c.payload;
  const [editing, setEditing] = useState(false);
  const needsNewValue = c.flags.includes(NOT_IN_CHOICES);
  const fields = needsNewValue ? [{ key: 'value', label: 'Value' }] : (EDITABLE[c.op] ?? []);
  const title = summary(c, names);
  const applied = c.status === 'applied';
  const choosing = c.op === 'createEntity' && c.matchCandidates.length > 0 && !applied;
  const choice = typeof p.useKey === 'string' ? p.useKey : p.needsChoice ? '' : 'new';
  const tone =
    c.status === 'accepted'
      ? 'bg-ok-soft'
      : c.status === 'rejected'
        ? 'bg-surface opacity-60'
        : applied
          ? 'bg-sunk'
          : 'bg-surface';

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    props.onPatch({
      payload: Object.fromEntries(fields.map((f) => [f.key, String(data.get(f.key) ?? '')])),
    });
    setEditing(false);
  }

  return (
    <article
      aria-label={title}
      className={`flex flex-col gap-2 rounded-xl p-4 ${tone}`}
      onMouseEnter={() => props.onActive(true)}
      onMouseLeave={() => props.onActive(false)}
      onFocus={() => props.onActive(true)}
      onBlur={() => props.onActive(false)}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
        <span className="font-medium uppercase tracking-wide">{OP_LABEL[c.op] ?? c.op}</span>
        <span>{Math.round(c.confidence * 100)}% sure</span>
      </div>
      <p className="font-medium">{title}</p>
      {c.flags.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {c.flags.map((f) => (
            <li key={f} className="rounded-full bg-bad-soft px-2 py-0.5 text-xs text-bad">
              {FLAG_TEXT[f] ?? f}
            </li>
          ))}
        </ul>
      )}
      {typeof p.quote === 'string' && p.quote && (
        <p className="font-script text-sm text-muted">“{p.quote}”</p>
      )}

      {choosing && (
        <fieldset className="flex flex-col gap-1 rounded-lg bg-panel p-2 text-sm">
          <legend className="sr-only">Is “{String(p.name)}” already in the codex?</legend>
          <p className="font-medium">
            {p.needsChoice ? 'Is this an entry you already have? Choose one.' : 'Matched as:'}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={`choice-${c.index}`}
              checked={choice === 'new'}
              disabled={props.busy}
              onChange={() => props.onPatch({ payload: { useKey: null, needsChoice: false } })}
            />
            A new entry
          </label>
          {c.matchCandidates.map((m) => (
            <label key={m.key} className="flex items-center gap-2">
              <input
                type="radio"
                name={`choice-${c.index}`}
                checked={choice === m.key}
                disabled={props.busy}
                onChange={() => props.onPatch({ payload: { useKey: m.key, needsChoice: false } })}
              />
              {names.entry(m.key)} ({Math.round(m.score * 100)}% match)
            </label>
          ))}
        </fieldset>
      )}

      {editing && (
        <form onSubmit={save} className="flex flex-col gap-2" aria-label="Edit change">
          {fields.map((f) => (
            <Field key={f.key} name={f.key} label={f.label} defaultValue={String(p[f.key] ?? '')} />
          ))}
          <div className="flex gap-1">
            <Button type="submit" disabled={props.busy}>
              Save edit
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {applied ? (
        <p className="text-sm text-muted">In the codex</p>
      ) : (
        !editing && (
          <div className="flex gap-1">
            <Button
              aria-pressed={c.status === 'accepted'}
              disabled={props.busy || p.needsChoice === true || needsNewValue}
              className={c.status === 'accepted' ? 'text-ink' : ''}
              onClick={() =>
                props.onPatch({ status: c.status === 'accepted' ? 'pending' : 'accepted' })
              }
            >
              {c.status === 'accepted' ? 'Accepted' : 'Accept'}
            </Button>
            <Button
              aria-pressed={c.status === 'rejected'}
              disabled={props.busy}
              className={c.status === 'rejected' ? 'text-ink' : ''}
              onClick={() =>
                props.onPatch({ status: c.status === 'rejected' ? 'pending' : 'rejected' })
              }
            >
              {c.status === 'rejected' ? 'Rejected' : 'Reject'}
            </Button>
            {fields.length > 0 && (
              <Button disabled={props.busy} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </div>
        )
      )}
    </article>
  );
}
