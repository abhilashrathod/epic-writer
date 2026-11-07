'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AI_PROVIDERS, type AiKeyDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { api } from '../lib/api-client';

const NAME: Record<(typeof AI_PROVIDERS)[number], string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
};

/** Bring your own key (AI-1, AI-2): keys are encrypted on the server and never shown again. */
export function AiKeysSettings() {
  const qc = useQueryClient();
  const keys = useQuery({
    queryKey: ['aiKeys'],
    queryFn: () => api<{ keys: AiKeyDto[] }>('/api/me/ai-keys').then((r) => r.keys),
  });
  const [provider, setProvider] = useState<(typeof AI_PROVIDERS)[number]>('anthropic');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['aiKeys'] });
  const save = useMutation({
    mutationFn: () => api('/api/me/ai-keys', { method: 'POST', body: { provider, key, label } }),
    onSuccess: async () => {
      setKey('');
      setLabel('');
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (p: string) => api(`/api/me/ai-keys/${p}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <section aria-label="AI keys" className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">AI keys</h2>
        <p className="text-sm text-muted">
          Epic Writer uses your own API key. It is encrypted on the server and never sent back to
          the browser; only the last four characters are shown. Claude.ai and ChatGPT subscriptions
          can’t be used.
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {keys.data?.length === 0 && <li className="text-sm text-muted">No keys saved yet.</li>}
        {keys.data?.map((k) => (
          <li
            key={k.provider}
            className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 text-sm"
          >
            <span className="font-medium">{NAME[k.provider]}</span>
            <span className="text-muted">
              {k.label || 'Key'} ending in {k.last4}
            </span>
            <Button
              className="ml-auto h-7"
              onClick={() => remove.mutate(k.provider)}
              aria-label={`Remove ${NAME[k.provider]} key`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-panel p-4">
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
                {NAME[p]}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="API key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          hint="Saving replaces any key you already saved for this provider."
        />
        <Field
          label="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
        />
        {save.error && (
          <p role="alert" className="text-sm text-bad">
            {save.error.message}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={!key.trim() || save.isPending}
        >
          Save key
        </Button>
      </form>
    </section>
  );
}
