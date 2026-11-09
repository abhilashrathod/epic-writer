'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { DEFAULT_MODELS } from '@epic/ai/defaults';
import { formatCost } from '@epic/ai/pricing';
import { AI_PROVIDERS, type AiSettingsDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';
import { useWorkspace } from './Workspace';

const TASKS = [
  ['extraction', 'Extraction'],
  ['continuity', 'Continuity checks'],
  ['chat', 'Ask the codex'],
  ['classification', 'Finding names (first extraction step)'],
] as const;

/** Project AI settings (AI-1, AI-10): provider, a model per task, the monthly cap and spend. */
export function AiSettings() {
  const { projectId } = useWorkspace();
  const qc = useQueryClient();
  const url = `/api/projects/${projectId}/ai-settings`;
  const data = useQuery({
    queryKey: ['aiSettings', projectId],
    queryFn: () => api<AiSettingsDto>(url),
  });
  if (data.isPending) return <p className="p-8 text-muted">Loading AI settings…</p>;
  if (data.error)
    return (
      <p role="alert" className="m-8 text-bad">
        Couldn’t load AI settings: {data.error.message}
      </p>
    );
  return (
    <Form
      initial={data.data}
      onSaved={() => qc.invalidateQueries({ queryKey: ['aiSettings', projectId] })}
      url={url}
    />
  );
}

function Form({
  initial,
  onSaved,
  url,
}: {
  initial: AiSettingsDto;
  onSaved: () => void;
  url: string;
}) {
  const [provider, setProvider] = useState(initial.provider);
  const [models, setModels] = useState(initial.models);
  const [cap, setCap] = useState(
    initial.monthlyCapMicros ? String(initial.monthlyCapMicros / 1_000_000) : '',
  );
  const save = useMutation({
    mutationFn: () =>
      api(url, {
        method: 'PUT',
        body: { provider, models, monthlyCapMicros: Math.round((Number(cap) || 0) * 1_000_000) },
      }),
    onSuccess: onSaved,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  const hasKey = initial.keyProviders.includes(provider);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">AI settings</h1>
      <section
        aria-label="Spend this month"
        className="flex flex-col gap-2 rounded-xl bg-surface p-4"
      >
        <p className="text-sm text-muted">Spent this month</p>
        <p className="text-2xl font-semibold">{formatCost(initial.spend.monthTotal)}</p>
        <ul className="text-sm text-muted">
          {TASKS.filter(([task]) => task !== 'classification').map(([task, label]) => (
            <li key={task}>
              {label}: {formatCost(initial.spend.byTask[task] ?? 0)}
            </li>
          ))}
        </ul>
      </section>
      <form onSubmit={submit} aria-label="AI settings" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Provider
          <select
            aria-label="Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className={`h-10 rounded-lg bg-sunk px-3 font-normal ${focusRing}`}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {!hasKey && (
          <p role="alert" className="rounded-lg bg-warn-soft p-3 text-sm">
            No {provider} key saved.{' '}
            <Link href="/settings" className="underline">
              Add one in Settings
            </Link>{' '}
            before running AI.
          </p>
        )}
        {TASKS.map(([task, label]) => (
          <Field
            key={task}
            label={`Model for ${label.toLowerCase()}`}
            placeholder={DEFAULT_MODELS[provider][task]}
            hint="Leave blank to use the suggested model shown."
            value={models[task]}
            onChange={(e) => setModels({ ...models, [task]: e.target.value })}
          />
        ))}
        <Field
          label="Monthly cap in dollars"
          type="number"
          min={0}
          step="0.01"
          placeholder="No cap"
          hint="AI jobs pause once this month’s spend reaches the cap."
          value={cap}
          onChange={(e) => setCap(e.target.value)}
        />
        {save.error && (
          <p role="alert" className="text-sm text-bad">
            {save.error.message}
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="text-sm text-ok">
            Saved.
          </p>
        )}
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          Save AI settings
        </Button>
      </form>
    </div>
  );
}
