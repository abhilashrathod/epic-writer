'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { FIELD_KINDS } from '@epic/schemas/entity-fields';
import { TRAITS, TYPE_COLORS, type EntityTypeDto, type EntityTypeInput } from '@epic/schemas/api';
import { Button, Field, ICONS, Icon, TYPE_BG, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { fieldKeyFrom, typesKey } from '../lib/use-types';
import { useWorkspace } from './Workspace';

type FieldInput = EntityTypeInput['fields'][number];

const KIND_LABEL: Record<FieldInput['kind'], string> = {
  text: 'Text',
  richtext: 'Long text',
  number: 'Number',
  quantity: 'Quantity with unit',
  date: 'Story date',
  enum: 'Choice',
  multiEnum: 'Multiple choice',
  boolean: 'Yes / no',
  entityRef: 'Entry',
  entityRefList: 'List of entries',
  image: 'Image',
  list: 'List of text',
  composition: 'Composition (e.g. army makeup)',
};

const TRAIT_HINT: Record<(typeof TRAITS)[number], string> = {
  born: 'Has a birth date; ages are computed',
  locatable: 'Has a location over time',
  holdable: 'Can be held by someone',
  hasStrength: 'Has strength that battles change',
  ranked: 'Holds ranks or classifications',
  position: 'An office held over time',
  institution: 'A group with members',
  ruleSystem: 'Rules with costs and limits',
  ability: 'A power with uses and conditions',
  event: 'Happens at a point in story time',
  secret: 'Known by some, over time',
  setup: 'Planted and paid off',
  account: 'An in-world source that may disagree',
  transport: 'Moves people or things',
  resource: 'Produced and traded',
  term: 'A word in the glossary',
  geo: 'Part of the geography',
};

const inputSelect = `h-9 rounded-md bg-sunk px-2 text-sm ${focusRing}`;

export function TypeForm(props: {
  existing: EntityTypeDto | null;
  groups: { key: string; name: string }[];
  types: EntityTypeDto[];
  onDone: (key: string | null) => void;
}) {
  const { projectId } = useWorkspace();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EntityTypeInput>(
    props.existing ?? {
      name: '',
      pluralName: '',
      icon: 'circle',
      color: 'cat-1',
      group: props.groups[0]?.key ?? '',
      parentTypeKey: null,
      traits: [],
      fields: [],
    },
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<EntityTypeInput>) => setDraft((d) => ({ ...d, ...patch }));
  const setField = (i: number, patch: Partial<FieldInput>) =>
    set({ fields: draft.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  const base = `/api/projects/${projectId}/entity-types`;
  const refresh = () => qc.invalidateQueries({ queryKey: typesKey(projectId) });
  const save = useMutation({
    mutationFn: () =>
      props.existing
        ? api(`${base}/${props.existing.key}`, { method: 'PUT', body: draft }).then(
            () => props.existing!.key,
          )
        : api<{ key: string }>(base, { method: 'POST', body: draft }).then((r) => r.key),
    onSuccess: async (key) => {
      await refresh();
      props.onDone(key);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`${base}/${props.existing!.key}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh();
      props.onDone(null);
    },
  });

  function addField() {
    const taken = new Set(draft.fields.map((f) => f.key));
    set({
      fields: [
        ...draft.fields,
        {
          key: fieldKeyFrom('New field', taken),
          label: '',
          kind: 'text',
          options: [],
          required: false,
          timeVarying: false,
          refTypeKeys: [],
        },
      ],
    });
  }
  function relabel(i: number, label: string) {
    const f = draft.fields[i]!;
    // Keys follow the label only until the type is saved; afterwards stored values depend on them.
    const saved = props.existing?.fields.some((e) => e.key === f.key);
    const taken = new Set(draft.fields.filter((_, j) => j !== i).map((x) => x.key));
    setField(i, saved ? { label } : { label, key: fieldKeyFrom(label || 'field', taken) });
  }
  function move(i: number, d: -1 | 1) {
    const fields = [...draft.fields];
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    [fields[i], fields[j]] = [fields[j]!, fields[i]!];
    set({ fields });
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const others = props.types.filter((t) => t.key !== props.existing?.key);

  return (
    <form
      onSubmit={submit}
      className="flex max-w-3xl flex-col gap-6"
      aria-label={props.existing ? `Edit ${props.existing.name}` : 'New entry type'}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Character"
          maxLength={80}
        />
        <Field
          label="Plural"
          value={draft.pluralName}
          onChange={(e) => set({ pluralName: e.target.value })}
          placeholder="e.g. Characters"
          maxLength={80}
        />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Group
          <select
            aria-label="Group"
            value={draft.group}
            onChange={(e) => set({ group: e.target.value })}
            className={`${inputSelect} h-10 font-normal`}
          >
            {props.groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Parent type
          <select
            aria-label="Parent type"
            value={draft.parentTypeKey ?? ''}
            onChange={(e) => set({ parentTypeKey: e.target.value || null })}
            className={`${inputSelect} h-10 font-normal`}
          >
            <option value="">None</option>
            {others.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Icon and colour</legend>
        <div className="flex flex-wrap gap-1">
          {Object.keys(ICONS).map((name) => (
            <button
              type="button"
              key={name}
              aria-label={`Icon: ${name}`}
              aria-pressed={draft.icon === name}
              onClick={() => set({ icon: name })}
              className={`grid h-9 w-9 place-items-center rounded-md text-lg ${focusRing} ${draft.icon === name ? 'bg-selected text-on-selected' : 'bg-sunk text-muted hover:text-ink'}`}
            >
              <Icon name={name} />
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TYPE_COLORS.map((c, i) => (
            <button
              type="button"
              key={c}
              aria-label={`Colour ${i + 1}`}
              aria-pressed={draft.color === c}
              onClick={() => set({ color: c })}
              className={`h-7 w-7 rounded-full ${TYPE_BG[c]} ${focusRing} ${draft.color === c ? 'outline-2 outline-offset-2 outline-ink' : ''}`}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Traits</legend>
        <p className="text-sm text-muted">
          Traits switch on system behaviour: computed ages, holders over time, continuity checks.
        </p>
        <div className="grid gap-1 sm:grid-cols-2">
          {TRAITS.map((t) => (
            <label
              key={t}
              className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-sunk"
            >
              <input
                type="checkbox"
                checked={draft.traits.includes(t)}
                onChange={(e) =>
                  set({
                    traits: e.target.checked
                      ? [...draft.traits, t]
                      : draft.traits.filter((x) => x !== t),
                  })
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium">{t}</span>{' '}
                <span className="text-muted">· {TRAIT_HINT[t]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Fields</legend>
        {draft.fields.length === 0 && (
          <p className="text-sm text-muted">
            Every entry already has a name, aliases, summary, tags and canon state. Add fields for
            anything else.
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {draft.fields.map((f, i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-lg bg-panel p-3"
              aria-label={`Field ${f.label || i + 1}`}
            >
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted">
                  Label
                  <input
                    aria-label="Label"
                    value={f.label}
                    onChange={(e) => relabel(i, e.target.value)}
                    className={`${inputSelect} text-ink`}
                    placeholder="e.g. Weapon of choice"
                    maxLength={80}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Kind
                  <select
                    aria-label="Kind"
                    value={f.kind}
                    onChange={(e) => setField(i, { kind: e.target.value as FieldInput['kind'] })}
                    className={`${inputSelect} text-ink`}
                  >
                    {FIELD_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-1">
                  <Button
                    className="h-9"
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${f.label || 'field'} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    className="h-9"
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${f.label || 'field'} down`}
                  >
                    ↓
                  </Button>
                  <Button
                    className="h-9"
                    onClick={() => set({ fields: draft.fields.filter((_, j) => j !== i) })}
                    aria-label={`Remove ${f.label || 'field'}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {(f.kind === 'enum' || f.kind === 'multiEnum') && (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Choices, separated by commas
                  <input
                    aria-label="Choices, separated by commas"
                    defaultValue={f.options.join(', ')}
                    onBlur={(e) =>
                      setField(i, {
                        options: e.target.value
                          .split(',')
                          .map((o) => o.trim())
                          .filter(Boolean),
                      })
                    }
                    className={`${inputSelect} text-ink`}
                    placeholder="e.g. alive, dead, missing"
                  />
                </label>
              )}
              {(f.kind === 'entityRef' || f.kind === 'entityRefList') && (
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span>Points to:</span>
                  {props.types.map((t) => (
                    <label key={t.key} className="flex items-center gap-1 text-ink">
                      <input
                        type="checkbox"
                        checked={f.refTypeKeys.includes(t.key)}
                        onChange={(e) =>
                          setField(i, {
                            refTypeKeys: e.target.checked
                              ? [...f.refTypeKeys, t.key]
                              : f.refTypeKeys.filter((k) => k !== t.key),
                          })
                        }
                      />
                      {t.name}
                    </label>
                  ))}
                  {f.refTypeKeys.length === 0 && <span>(any type)</span>}
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => setField(i, { required: e.target.checked })}
                  />{' '}
                  Required
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={f.timeVarying}
                    onChange={(e) => setField(i, { timeVarying: e.target.checked })}
                  />{' '}
                  Changes over time
                </label>
                <span className="ml-auto text-xs text-faint">key: {f.key}</span>
              </div>
            </li>
          ))}
        </ol>
        <Button className="self-start" onClick={addField}>
          + Add field
        </Button>
      </fieldset>

      {save.error && (
        <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
          {save.error.message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {props.existing ? 'Save type' : 'Create type'}
        </Button>
        <Button onClick={() => props.onDone(props.existing?.key ?? null)}>Cancel</Button>
        {props.existing && !confirmDelete && (
          <Button className="ml-auto text-bad" onClick={() => setConfirmDelete(true)}>
            Delete type…
          </Button>
        )}
      </div>
      {confirmDelete && props.existing && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-bad-soft p-3 text-sm">
          <span>
            Delete the “{props.existing.name}” type? This only works when no entries use it.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded-md bg-bad px-2 py-1 font-medium text-surface ${focusRing}`}
              onClick={() => remove.mutate()}
            >
              Delete {props.existing.name}
            </button>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
          {remove.error && <span className="text-bad">{remove.error.message}</span>}
        </div>
      )}
    </form>
  );
}
