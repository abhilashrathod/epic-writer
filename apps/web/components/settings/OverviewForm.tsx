'use client';

import { useState, type FormEvent } from 'react';
import type { EntityDto, OverviewDto } from '@epic/schemas/api';
import { Button, Field, focusRing } from '@epic/ui';
import { useSaveSettings } from '../../lib/use-project-settings';

const area = `w-full rounded-lg bg-sunk px-3 py-2 text-ink ${focusRing}`;
const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

type TextKey = 'synopsisShort' | 'synopsisLong' | 'premise' | 'hook' | 'arc';
const AREAS: [TextKey, string, number][] = [
  ['synopsisShort', 'Short synopsis', 3],
  ['synopsisLong', 'Long synopsis', 8],
  ['premise', 'Premise', 3],
  ['hook', 'Hook', 2],
  ['arc', 'Arc', 4],
];

/** The project overview (PR-5). Themes are codex entries. */
export function OverviewForm(props: {
  projectId: string;
  overview: OverviewDto;
  entries: EntityDto[];
}) {
  const [o, setO] = useState(props.overview);
  const [genres, setGenres] = useState(props.overview.genres.join(', '));
  const [questions, setQuestions] = useState(props.overview.keyQuestions.join('\n'));
  const [pick, setPick] = useState('');
  const save = useSaveSettings(props.projectId);
  const patch = (p: Partial<OverviewDto>) => setO((x) => ({ ...x, ...p }));
  const name = new Map(props.entries.map((e) => [e.key, e.name]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      overview: {
        ...o,
        genres: genres
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        keyQuestions: lines(questions),
      },
    });
  };

  return (
    <form aria-label="Overview" onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Overview</h2>
      <Field
        label="Logline"
        value={o.logline}
        maxLength={500}
        onChange={(e) => patch({ logline: e.target.value })}
      />
      <Field
        label="Tagline"
        value={o.tagline}
        maxLength={200}
        onChange={(e) => patch({ tagline: e.target.value })}
      />
      {AREAS.map(([key, label, rows]) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm font-medium">
          {label}
          <textarea
            rows={rows}
            className={`${area} font-normal`}
            value={o[key]}
            onChange={(e) => patch({ [key]: e.target.value })}
          />
        </label>
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Genres, comma-separated"
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
        />
        <Field
          label="Tone"
          value={o.tone}
          maxLength={500}
          onChange={(e) => patch({ tone: e.target.value })}
        />
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Key questions, one per line
        <textarea
          rows={3}
          className={`${area} font-normal`}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
        />
      </label>

      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="mb-1.5 font-medium">Themes</legend>
        {o.themeKeys.map((k) => (
          <span key={k} className="flex items-center gap-1 rounded-md bg-sunk px-2 py-1">
            {name.get(k) ?? 'Removed entry'}
            <button
              type="button"
              aria-label={`Remove theme ${name.get(k) ?? ''}`}
              className={`rounded text-muted hover:text-ink ${focusRing}`}
              onClick={() => patch({ themeKeys: o.themeKeys.filter((x) => x !== k) })}
            >
              ×
            </button>
          </span>
        ))}
        <select
          aria-label="Theme to add"
          className={`h-8 rounded-md bg-sunk px-2 ${focusRing}`}
          value={pick}
          onChange={(e) => setPick(e.target.value)}
        >
          <option value="">Choose a codex entry…</option>
          {props.entries
            .filter((e) => !o.themeKeys.includes(e.key))
            .map((e) => (
              <option key={e.key} value={e.key}>
                {e.name}
              </option>
            ))}
        </select>
        <Button
          disabled={!pick}
          onClick={() => {
            patch({ themeKeys: [...o.themeKeys, pick] });
            setPick('');
          }}
        >
          Add theme
        </Button>
      </fieldset>

      {save.error && (
        <p role="alert" className="text-sm text-bad">
          {save.error.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save overview
        </Button>
        {save.isSuccess && !save.isPending && <span className="text-sm text-muted">Saved.</span>}
      </div>
    </form>
  );
}
