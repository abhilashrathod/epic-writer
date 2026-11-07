'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { CANON_STATES, PROMINENCE, type EntityDto, type EntityInput } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { entitiesKey, type TypesData } from '../../lib/use-types';
import { EntryCard } from './EntryCard';
import { FieldInput } from './FieldInput';

const select = `h-10 rounded-lg bg-sunk px-3 text-ink ${focusRing}`;
const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/** New-entry and edit form with a live card preview (CX-10). Fields follow the chosen type. */
export function EntryForm(props: {
  projectId: string;
  meta: TypesData;
  entries: EntityDto[];
  existing: EntityDto | null;
  initialTypeKey?: string;
  initialName?: string;
  onDone: (key: string | null) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EntityInput>(
    props.existing ?? {
      typeKey: props.initialTypeKey ?? props.meta.types[0]?.key ?? '',
      name: props.initialName ?? '',
      aliases: [],
      summary: '',
      prominence: 'minor',
      canonState: 'canon',
      tags: [],
      fields: {},
    },
  );
  // Comma lists are edited as text and parsed on submit, so typing "a, " doesn't fight the input.
  const [aliases, setAliases] = useState(draft.aliases.join(', '));
  const [tags, setTags] = useState(draft.tags.join(', '));
  const set = (patch: Partial<EntityInput>) => setDraft((d) => ({ ...d, ...patch }));
  const type = props.meta.types.find((t) => t.key === draft.typeKey);
  const base = `/api/projects/${props.projectId}/entities`;

  const save = useMutation({
    mutationFn: () => {
      const body = { ...draft, aliases: splitList(aliases), tags: splitList(tags) };
      return props.existing
        ? api(`${base}/${props.existing.key}`, { method: 'PUT', body }).then(
            () => props.existing!.key,
          )
        : api<{ key: string }>(base, { method: 'POST', body }).then((r) => r.key);
    },
    onSuccess: async (key) => {
      await qc.invalidateQueries({ queryKey: entitiesKey(props.projectId) });
      props.onDone(key);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form
      onSubmit={submit}
      aria-label={props.existing ? `Edit ${props.existing.name}` : 'New entry'}
      className="flex flex-col gap-5"
    >
      <div aria-label="Card preview" role="group">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Preview</p>
        <EntryCard
          entry={{ ...draft, aliases: splitList(aliases), tags: splitList(tags) }}
          type={type}
        />
      </div>

      {!props.existing && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Type
          <select
            aria-label="Type"
            className={select}
            value={draft.typeKey}
            onChange={(e) => set({ typeKey: e.target.value, fields: {} })}
          >
            {props.meta.types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Field
        label="Name"
        value={draft.name}
        onChange={(e) => set({ name: e.target.value })}
        maxLength={200}
        autoFocus
      />
      <Field
        label="Also known as"
        hint="Separate names with commas"
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
      />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Summary
        <textarea
          rows={3}
          className={`${select} h-auto py-2 font-normal`}
          value={draft.summary}
          onChange={(e) => set({ summary: e.target.value })}
          maxLength={5000}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Prominence
          <select
            aria-label="Prominence"
            className={select}
            value={draft.prominence}
            onChange={(e) => set({ prominence: e.target.value as EntityInput['prominence'] })}
          >
            {PROMINENCE.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Canon state
          <select
            aria-label="Canon state"
            className={select}
            value={draft.canonState}
            onChange={(e) => set({ canonState: e.target.value as EntityInput['canonState'] })}
          >
            {CANON_STATES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Field
        label="Tags"
        hint="Separate tags with commas"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />

      {type?.fields.map((f) => (
        <FieldInput
          key={f.key}
          field={f}
          value={draft.fields[f.key]}
          onChange={(v) => set({ fields: { ...draft.fields, [f.key]: v } })}
          meta={props.meta}
          entries={props.entries}
          selfKey={props.existing?.key}
        />
      ))}

      {save.error && (
        <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={save.isPending || !draft.name.trim() || !type}
        >
          {props.existing ? 'Save entry' : 'Save to codex'}
        </Button>
        <Button onClick={() => props.onDone(props.existing?.key ?? null)}>Cancel</Button>
      </div>
    </form>
  );
}
