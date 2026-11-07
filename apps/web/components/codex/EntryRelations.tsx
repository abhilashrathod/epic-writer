'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { EntityDto, LinkTypeDto, RelationsDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { relationsKey, useLinkTypes } from '../../lib/use-types';

const KIND_TITLE: Record<string, string> = {
  kinship: 'Family',
  membership: 'Membership',
  relation: 'Relations',
  location: 'Places',
  ownership: 'Holdings',
  teaching: 'Teachers and students',
  knowledge: 'Knowledge',
  causal: 'Causes and effects',
  narrative: 'Story',
};

const select = `h-10 w-full rounded-lg bg-sunk px-3 text-ink ${focusRing}`;

/** One option per direction a link type can take from this entry: "parent of" or "child of". */
function choices(types: LinkTypeDto[], entryType: string) {
  return types.flatMap((t) => {
    const asFrom = !t.fromTypeKeys.length || t.fromTypeKeys.includes(entryType);
    const asTo = !t.toTypeKeys.length || t.toTypeKeys.includes(entryType);
    const out = [];
    if (asFrom || (t.symmetric && asTo))
      out.push({ id: `${t.key}:out`, label: t.label, type: t, outgoing: true });
    if (!t.symmetric && asTo)
      out.push({ id: `${t.key}:in`, label: t.inverseLabel, type: t, outgoing: false });
    return out;
  });
}

/**
 * Connections, back-references and appearances for one entry (CX-7, CX-8, CX-9). Driven by link
 * kinds and fields, not entry types, so dynasties show members and kingdoms their places and events.
 */
export function EntryRelations(props: {
  projectId: string;
  entry: EntityDto;
  entries: EntityDto[];
  onOpen: (key: string) => void;
}) {
  const { projectId, entry } = props;
  const qc = useQueryClient();
  const base = `/api/projects/${projectId}`;
  const key = relationsKey(projectId, entry.key);
  const rel = useQuery({
    queryKey: key,
    queryFn: () => api<RelationsDto>(`${base}/entities/${entry.key}/relations`),
  });
  const linkTypes = useLinkTypes(projectId);
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['relations', projectId] });
  const remove = useMutation({
    mutationFn: (k: string) => api(`${base}/links/${k}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const opts = choices(linkTypes.data ?? [], entry.typeKey);
  const picked = opts.find((o) => o.id === choice);
  const add = useMutation({
    mutationFn: () => {
      const [fromKey, toKey] = picked!.outgoing ? [entry.key, other] : [other, entry.key];
      return api(`${base}/links`, {
        method: 'POST',
        body: { typeKey: picked!.type.key, fromKey, toKey, note },
      });
    },
    onSuccess: async () => {
      setOther('');
      setNote('');
      setAdding(false);
      await refresh();
    },
  });

  const name = (k: string) => props.entries.find((e) => e.key === k)?.name ?? '(deleted entry)';
  const otherEnd = picked
    ? picked.outgoing
      ? picked.type.toTypeKeys
      : picked.type.fromTypeKeys
    : [];
  const targets = props.entries.filter(
    (e) =>
      e.key !== entry.key &&
      e.canonState !== 'scrapped' &&
      (!otherEnd.length ||
        otherEnd.includes(e.typeKey) ||
        (picked?.type.symmetric && picked.type.fromTypeKeys.includes(e.typeKey))),
  );
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }

  if (rel.isPending) return <p className="text-sm text-muted">Loading connections…</p>;
  if (rel.error)
    return <p className="text-sm text-bad">Couldn’t load connections: {rel.error.message}</p>;
  const byKind = new Map<string, RelationsDto['connections']>();
  for (const c of rel.data.connections) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const groups = [...byKind];

  return (
    <div className="flex flex-col gap-5 text-sm">
      <section aria-label="Connections" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Connections</h3>
          {!adding && opts.length > 0 && (
            <Button onClick={() => setAdding(true)}>+ Add connection</Button>
          )}
        </div>
        {groups.length === 0 && !adding && (
          <p className="text-muted">
            {opts.length
              ? 'No connections yet.'
              : 'No connection types fit this entry yet. Create one under Entry types.'}
          </p>
        )}
        {groups.map(([kind, list]) => (
          <div key={kind} className="flex flex-col gap-0.5">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              {KIND_TITLE[kind] ?? kind}
            </p>
            <ul>
              {list.map((c) => (
                <li key={c.key} className="group flex items-baseline gap-1.5 py-0.5">
                  <span className="text-muted">{c.label}</span>{' '}
                  <button
                    className="underline decoration-dotted underline-offset-2 hover:text-muted"
                    onClick={() => props.onOpen(c.otherKey)}
                  >
                    {name(c.otherKey)}
                  </button>
                  {c.note && <span className="text-faint"> · {c.note}</span>}
                  <Button
                    className="ml-auto h-6 px-1 opacity-60 group-hover:opacity-100"
                    aria-label={`Remove ${c.label} ${name(c.otherKey)}`}
                    onClick={() => remove.mutate(c.key)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {adding && (
          <form
            onSubmit={submit}
            aria-label="Add connection"
            className="flex flex-col gap-2 rounded-lg bg-surface p-3"
          >
            <select
              aria-label="Connection"
              className={select}
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value);
                setOther('');
              }}
            >
              <option value="">{entry.name} is…</option>
              {opts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Connect to"
              className={select}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              disabled={!picked}
            >
              <option value="">Pick an entry…</option>
              {targets.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Note"
              placeholder="Note (optional)"
              className={select}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
            {add.error && <p className="text-bad">{add.error.message}</p>}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" disabled={!picked || !other || add.isPending}>
                Connect
              </Button>
              <Button onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </section>

      {rel.data.referencedBy.length > 0 && (
        <section aria-label="Referenced by" className="flex flex-col gap-1">
          <h3 className="font-semibold">Referenced by</h3>
          <ul>
            {rel.data.referencedBy.map((r) => (
              <li key={`${r.entityKey}-${r.fieldLabel}`} className="py-0.5">
                <button
                  className="underline decoration-dotted underline-offset-2 hover:text-muted"
                  onClick={() => props.onOpen(r.entityKey)}
                >
                  {name(r.entityKey)}
                </button>{' '}
                <span className="text-muted">· {r.fieldLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Appearances" className="flex flex-col gap-1">
        <h3 className="font-semibold">Appearances</h3>
        {rel.data.appearances.length === 0 ? (
          <p className="text-muted">Not mentioned in any scene yet.</p>
        ) : (
          <ol>
            {rel.data.appearances.map((a) => (
              <li key={`${a.documentKey}-${a.sceneKey}`} className="py-0.5">
                <Link
                  href={`/projects/${projectId}/d/${a.documentKey}?scene=${a.sceneKey}`}
                  className="hover:underline"
                >
                  <span className="text-muted">{a.documentTitle} ·</span>{' '}
                  {a.heading || 'Untitled scene'}
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
