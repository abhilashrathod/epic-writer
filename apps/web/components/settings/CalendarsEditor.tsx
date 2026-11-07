'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatStoryTime } from '@epic/core/calendar';
import type { CalendarDto, CalendarInput } from '@epic/schemas/api';
import { Button, Field } from '@epic/ui';
import { api } from '../../lib/api-client';
import { settingsKey, useSaveSettings } from '../../lib/use-project-settings';
import { typesKey } from '../../lib/use-types';
import { BLANK_CALENDAR, CalendarForm } from './CalendarForm';

/**
 * The project's calendars (PR-3). All of them read the same story timeline; the default one
 * formats dates across the app. The preview shows one story day in every calendar.
 */
export function CalendarsEditor(props: {
  projectId: string;
  calendars: CalendarDto[];
  defaultKey: string;
}) {
  const { projectId, calendars, defaultKey } = props;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [day, setDay] = useState(0);
  const makeDefault = useSaveSettings(projectId);
  const base = `/api/projects/${projectId}/calendars`;
  const done = () => {
    setEditing(null);
    return Promise.all([
      qc.invalidateQueries({ queryKey: settingsKey(projectId) }),
      qc.invalidateQueries({ queryKey: typesKey(projectId) }),
    ]);
  };
  const save = useMutation({
    mutationFn: ({ key, body }: { key: string | null; body: CalendarInput }) =>
      key ? api(`${base}/${key}`, { method: 'PUT', body }) : api(base, { method: 'POST', body }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (key: string) => api(`${base}/${key}`, { method: 'DELETE' }),
    onSuccess: done,
  });
  const error = makeDefault.error ?? remove.error;

  return (
    <section aria-label="Calendars" className="flex max-w-3xl flex-col gap-3">
      <h2 className="text-lg font-semibold">Calendars</h2>
      <div className="flex max-w-xs">
        <Field
          label="Preview story day"
          type="number"
          value={day}
          onChange={(e) => setDay(Math.trunc(Number(e.target.value)))}
        />
      </div>
      <ul className="flex flex-col gap-2">
        {calendars.map((c) => (
          <li key={c.key} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-panel px-3 py-2 text-sm">
              <span className="font-medium">{c.name}</span>
              {c.key === defaultKey && <span className="text-muted">Default</span>}
              <span className="text-muted" aria-label={`${c.name} reads`}>
                {formatStoryTime(c, { start: day, end: null, precision: 'day' })}
              </span>
              <span className="ml-auto flex gap-1">
                {c.key !== defaultKey && (
                  <Button
                    onClick={() => makeDefault.mutate({ defaultCalendarKey: c.key })}
                    disabled={makeDefault.isPending}
                  >
                    Make default
                  </Button>
                )}
                <Button onClick={() => setEditing(c.key)}>Edit {c.name}</Button>
                {c.key !== defaultKey && (
                  <Button onClick={() => remove.mutate(c.key)} disabled={remove.isPending}>
                    Delete {c.name}
                  </Button>
                )}
              </span>
            </div>
            {editing === c.key && (
              <CalendarForm
                initial={c}
                submitLabel="Save calendar"
                pending={save.isPending}
                error={save.error?.message}
                onSubmit={(body) => save.mutate({ key: c.key, body })}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <CalendarForm
          initial={BLANK_CALENDAR}
          submitLabel="Add calendar"
          pending={save.isPending}
          error={save.error?.message}
          onSubmit={(body) => save.mutate({ key: null, body })}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button className="self-start" onClick={() => setEditing('new')}>
          + New calendar
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error.message}
        </p>
      )}
    </section>
  );
}
