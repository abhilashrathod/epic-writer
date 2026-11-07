'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { LINK_KINDS, type EntityTypeDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { linkTypesKey } from '../lib/use-types';
import { useWorkspace } from './Workspace';

/** Creates a kind of connection between entries, e.g. "rides" / "ridden by". */
export function ConnectionTypeForm({
  types,
  onDone,
}: {
  types: EntityTypeDto[];
  onDone: () => void;
}) {
  const { projectId } = useWorkspace();
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [inverseLabel, setInverse] = useState('');
  const [kind, setKind] = useState<(typeof LINK_KINDS)[number]>('relation');
  const [symmetric, setSymmetric] = useState(false);
  const [from, setFrom] = useState<string[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/link-types`, {
        method: 'POST',
        body: {
          label,
          inverseLabel: symmetric ? label : inverseLabel,
          kind,
          symmetric,
          fromTypeKeys: from,
          toTypeKeys: to,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: linkTypesKey(projectId) });
      onDone();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  const pick = (list: string[], set: (v: string[]) => void, legend: string) => (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-3 text-sm">
        {types.map((t) => (
          <label key={t.key} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={list.includes(t.key)}
              onChange={(e) =>
                set(e.target.checked ? [...list, t.key] : list.filter((k) => k !== t.key))
              }
            />
            {t.name}
          </label>
        ))}
        {list.length === 0 && <span className="text-muted">(any type)</span>}
      </div>
    </fieldset>
  );

  return (
    <form
      onSubmit={submit}
      aria-label="New connection type"
      className="flex max-w-2xl flex-col gap-4"
    >
      <h2 className="text-lg font-semibold">New connection type</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Reads as"
          placeholder="e.g. rides"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
        />
        <Field
          label="Reverse reads as"
          placeholder="e.g. ridden by"
          value={symmetric ? label : inverseLabel}
          onChange={(e) => setInverse(e.target.value)}
          disabled={symmetric}
          maxLength={60}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Kind
          <select
            aria-label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={`h-10 rounded-lg bg-sunk px-3 font-normal ${focusRing}`}
          >
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={symmetric}
            onChange={(e) => setSymmetric(e.target.checked)}
          />{' '}
          Same both ways (e.g. “ally of”)
        </label>
      </div>
      {pick(from, setFrom, 'From entries of type')}
      {pick(to, setTo, 'To entries of type')}
      {save.error && (
        <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Create connection type
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
