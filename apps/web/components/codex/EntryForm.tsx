'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CANON_STATES, PROMINENCE, type EntityDto, type EntityInput } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../../lib/api-client';
import { fieldSteps } from '../../lib/entry-steps';
import { entitiesKey, type TypesData } from '../../lib/use-types';
import { worldKey } from '../../lib/use-world';
import { EntryCard } from './EntryCard';
import { EntryImages } from './EntryImages';
import { FieldInput } from './FieldInput';

const select = `h-10 rounded-lg bg-sunk px-3 text-ink ${focusRing}`;
const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const isFilled = (v: unknown) =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
const FULL_WIDTH_KINDS = new Set([
  'richtext',
  'list',
  'composition',
  'narrativeRef',
  'narrativeRefList',
  'multiEnum',
  'entityRefList',
  'date',
  'image',
]);

/**
 * New-entry and edit wizard with a live card preview (CX-10). Steps follow the chosen type; any
 * step can be opened and the entry saved from any of them. `wide` is the full-page layout.
 */
export function EntryForm(props: {
  projectId: string;
  meta: TypesData;
  entries: EntityDto[];
  existing: EntityDto | null;
  initialTypeKey?: string;
  initialName?: string;
  wide?: boolean;
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
  const steps = useMemo(
    () => [{ title: 'Basics', fields: [] }, ...fieldSteps(type?.fields ?? [])],
    [type],
  );
  const [stepIndex, setStepIndex] = useState(0);
  const at = Math.min(stepIndex, steps.length - 1);
  const step = steps[at]!;
  const heading = useRef<HTMLHeadingElement>(null);
  const goTo = (i: number) => {
    setStepIndex(i);
    heading.current?.focus();
  };

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
      await Promise.all([
        qc.invalidateQueries({ queryKey: entitiesKey(props.projectId) }),
        qc.invalidateQueries({ queryKey: worldKey(props.projectId) }),
      ]);
      props.onDone(key);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  // Enter moves on instead of saving a half-filled wizard.
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && at < steps.length - 1) {
      e.preventDefault();
      goTo(at + 1);
    }
  }

  const preview = (
    <div aria-label="Card preview" role="group">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-faint">Preview</p>
      <EntryCard
        entry={{ ...draft, aliases: splitList(aliases), tags: splitList(tags) }}
        type={type}
      />
    </div>
  );

  const basics = (
    <div className="flex flex-col gap-5">
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
      <EntryImages
        projectId={props.projectId}
        images={draft.images ?? []}
        onChange={(images) => set({ images })}
      />
    </div>
  );

  const stepNav = steps.length > 1 && (
    <nav
      aria-label="Steps"
      className={props.wide ? 'rounded-xl bg-panel p-2 lg:sticky lg:top-6 lg:self-start' : ''}
    >
      <ol
        className={`flex gap-1 ${props.wide ? 'overflow-x-auto lg:flex-col lg:overflow-visible' : 'flex-wrap'}`}
      >
        {steps.map((s, i) => {
          const filled = s.fields.filter((f) => isFilled(draft.fields[f.key])).length;
          const needsInput = s.fields.some((f) => f.required && !isFilled(draft.fields[f.key]));
          return (
            <li key={s.title} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === at ? 'step' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${focusRing} ${i === at ? 'bg-selected text-on-selected' : 'hover:bg-sunk'}`}
              >
                <span className="text-xs opacity-60">{i + 1}</span>
                <span>{s.title}</span>
                {i > 0 && (
                  <span className="ml-auto pl-2 text-xs opacity-60">
                    {needsInput ? 'Required' : `${filled}/${s.fields.length}`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  const next = steps[at + 1];
  return (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={props.existing ? `Edit ${props.existing.name}` : 'New entry'}
      className={
        props.wide
          ? 'grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]'
          : 'flex flex-col gap-5'
      }
    >
      {stepNav}
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight outline-none"
          >
            {step.title}
          </h2>
          <p className="text-sm text-muted">
            Step {at + 1} of {steps.length}
          </p>
        </div>
        {!props.wide && at === 0 && preview}
        {at === 0 ? (
          basics
        ) : (
          <div className={`grid gap-5 ${props.wide ? 'md:grid-cols-2' : ''}`}>
            {step.fields.map((f) => (
              <div key={f.key} className={FULL_WIDTH_KINDS.has(f.kind) ? 'md:col-span-2' : ''}>
                <FieldInput
                  field={f}
                  value={draft.fields[f.key]}
                  onChange={(v) => set({ fields: { ...draft.fields, [f.key]: v } })}
                  meta={props.meta}
                  entries={props.entries}
                  selfKey={props.existing?.key}
                />
              </div>
            ))}
          </div>
        )}

        {save.error && (
          <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
            {save.error.message}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {at > 0 && <Button onClick={() => goTo(at - 1)}>Back</Button>}
          {next && <Button onClick={() => goTo(at + 1)}>Next: {next.title}</Button>}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => props.onDone(props.existing?.key ?? null)}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={save.isPending || !draft.name.trim() || !type}
            >
              {props.existing ? 'Save entry' : 'Save to codex'}
            </Button>
          </div>
        </div>
      </div>
      {props.wide && <div className="hidden xl:sticky xl:top-6 xl:block">{preview}</div>}
    </form>
  );
}
