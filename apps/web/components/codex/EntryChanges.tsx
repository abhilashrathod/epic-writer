'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { formatStoryTime, type StoryTimeShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto, FactDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { entitiesKey, type TypesData } from '../../lib/use-types';
import { worldKey } from '../../lib/use-world';
import { FieldInput } from './FieldInput';
import { FieldValue } from './FieldValue';
import { StoryDateInput } from './StoryDateInput';

/** An entry's recorded changes over story time, and a form to record one (CX-3). */
export function EntryChanges(props: {
  projectId: string;
  entry: EntityDto;
  type: EntityTypeDto;
  meta: TypesData;
  entries: EntityDto[];
  facts: FactDto[];
  onOpen: (key: string) => void;
}) {
  const { projectId, entry, meta } = props;
  const qc = useQueryClient();
  const varying = props.type.fields.filter((f) => f.timeVarying && f.kind !== 'image');
  const [adding, setAdding] = useState(false);
  const [fieldKey, setFieldKey] = useState(varying[0]?.key ?? '');
  const [value, setValue] = useState<unknown>(null);
  const [when, setWhen] = useState<StoryTimeShape | null>(null);
  const [causeKey, setCauseKey] = useState('');
  const field = varying.find((f) => f.key === fieldKey);
  const causes = props.entries.filter(
    (e) =>
      e.canonState !== 'scrapped' &&
      meta.types.find((t) => t.key === e.typeKey)?.traits.includes('event'),
  );
  const base = `/api/projects/${projectId}/facts`;
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: worldKey(projectId) }),
      qc.invalidateQueries({ queryKey: entitiesKey(projectId) }),
    ]);

  const add = useMutation({
    mutationFn: () =>
      api(base, {
        method: 'POST',
        body: {
          entityKey: entry.key,
          field: fieldKey,
          value,
          storyTime: when,
          causeKey: causeKey || null,
        },
      }),
    onSuccess: async () => {
      await refresh();
      setAdding(false);
      setValue(null);
      setWhen(null);
      setCauseKey('');
    },
  });
  const remove = useMutation({
    mutationFn: (key: string) => api(`${base}/${key}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  if (!varying.length || !meta.calendar) return null;
  const cal = meta.calendar;
  const name = (k: string) => props.entries.find((e) => e.key === k)?.name ?? '(deleted entry)';

  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }

  return (
    <section aria-label="Changes over time" className="flex flex-col gap-2 text-sm">
      <h3 className="font-medium">Changes over time</h3>
      {props.facts.length === 0 ? (
        <p className="text-muted">No changes recorded. Values stay at their starting value.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {props.facts.map((f) => {
            const def = props.type.fields.find((x) => x.key === f.field);
            const date = formatStoryTime(cal, f.storyTime);
            return (
              <li key={f.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-muted">{date}</span>
                <span>
                  {def?.label ?? f.field}:{' '}
                  {def ? (
                    <FieldValue
                      field={def}
                      value={f.value}
                      calendar={cal}
                      units={meta.units}
                      entries={props.entries}
                      onOpen={props.onOpen}
                    />
                  ) : (
                    String(f.value)
                  )}
                </span>
                {f.causeKey && (
                  <span className="text-muted">
                    because of{' '}
                    <button
                      className={`underline decoration-dotted underline-offset-2 hover:text-ink ${focusRing}`}
                      onClick={() => props.onOpen(f.causeKey!)}
                    >
                      {name(f.causeKey)}
                    </button>
                  </span>
                )}
                <Button
                  className="ml-auto h-7 text-muted"
                  aria-label={`Remove change to ${def?.label ?? f.field} at ${date}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(f.key)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {remove.error && (
        <p role="alert" className="text-bad">
          {remove.error.message}
        </p>
      )}

      {adding ? (
        <form
          onSubmit={submit}
          aria-label="Record a change"
          className="flex flex-col gap-3 rounded-lg bg-surface p-3"
        >
          <label className="flex flex-col gap-1.5 font-medium">
            Field
            <select
              className={`h-10 rounded-lg bg-sunk px-3 font-normal ${focusRing}`}
              value={fieldKey}
              onChange={(e) => {
                setFieldKey(e.target.value);
                setValue(null);
              }}
            >
              {varying.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {field && (
            <FieldInput
              key={field.key}
              // The hint about starting values doesn't apply to a recorded change.
              field={{ ...field, label: `New ${field.label.toLowerCase()}`, timeVarying: false }}
              value={value}
              onChange={setValue}
              meta={meta}
              entries={props.entries}
              selfKey={entry.key}
            />
          )}
          <StoryDateInput label="When" calendar={cal} value={when} onChange={setWhen} />
          {causes.length > 0 && (
            <label className="flex flex-col gap-1.5 font-medium">
              Caused by (optional)
              <select
                className={`h-10 rounded-lg bg-sunk px-3 font-normal ${focusRing}`}
                value={causeKey}
                onChange={(e) => setCauseKey(e.target.value)}
              >
                <option value="">No event</option>
                {causes.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={!when || add.isPending}>
              Save change
            </Button>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          {add.error && (
            <p role="alert" className="text-bad">
              {add.error.message}
            </p>
          )}
        </form>
      ) : (
        <Button className="self-start" onClick={() => setAdding(true)}>
          Record a change
        </Button>
      )}
    </section>
  );
}
