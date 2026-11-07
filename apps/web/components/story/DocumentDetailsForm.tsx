'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, focusRing } from '@epic/ui';
import type { DocumentDetails, DocumentDto, EntityDto } from '@epic/schemas/api';
import { api } from '../../lib/api-client';
import { useTreeMutation } from '../../lib/use-tree';

const box = `w-full rounded-lg bg-sunk px-3 text-ink ${focusRing}`;

/**
 * Inline details for one document (WK-5): logline, summary and key events for an episode or
 * chapter, an arc summary for a container. Each field saves when it loses focus.
 */
export function DocumentDetailsForm(props: {
  projectId: string;
  doc: DocumentDto;
  events: EntityDto[];
}) {
  const { projectId, doc, events } = props;
  const [logline, setLogline] = useState(doc.logline);
  const [summary, setSummary] = useState(doc.summary);
  const [arc, setArc] = useState(doc.arcSummary);
  const [pick, setPick] = useState('');
  const save = useTreeMutation(projectId, (details: DocumentDetails) =>
    api(`/api/projects/${projectId}/documents/${doc.key}`, {
      method: 'PATCH',
      body: { details },
    }),
  );
  const saveIfChanged = (field: 'logline' | 'summary' | 'arcSummary', value: string) => {
    if (value.trim() !== doc[field]) save.mutate({ [field]: value });
  };
  const name = new Map(events.map((e) => [e.key, e.name]));
  const setEvents = (keys: string[]) => save.mutate({ keyEventKeys: keys });
  const depth = doc.orderPath.split('.').length;
  const Heading = depth === 1 ? 'h2' : 'h3';

  return (
    <section aria-label={doc.title} className="flex flex-col gap-2 rounded-xl bg-surface p-4">
      <Heading className="font-semibold">
        {doc.kind === 'text' ? (
          <Link href={`/projects/${projectId}/d/${doc.key}`} className="hover:underline">
            {doc.title}
          </Link>
        ) : (
          doc.title
        )}
      </Heading>

      {doc.kind === 'container' ? (
        <textarea
          aria-label={`Arc summary of ${doc.title}`}
          placeholder="Arc summary: how this part moves the story"
          rows={3}
          className={`${box} py-2`}
          value={arc}
          onChange={(e) => setArc(e.target.value)}
          onBlur={() => saveIfChanged('arcSummary', arc)}
        />
      ) : (
        <>
          <input
            aria-label={`Logline of ${doc.title}`}
            placeholder="Logline: the story in one sentence"
            className={`${box} h-10`}
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            onBlur={() => saveIfChanged('logline', logline)}
          />
          <textarea
            aria-label={`Summary of ${doc.title}`}
            placeholder="Summary"
            rows={3}
            className={`${box} py-2`}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onBlur={() => saveIfChanged('summary', summary)}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Key events:</span>
            {doc.keyEventKeys.map((k) => (
              <span key={k} className="flex items-center gap-1 rounded-md bg-sunk px-2 py-1">
                {name.get(k) ?? 'Removed entry'}
                <button
                  aria-label={`Remove ${name.get(k) ?? 'event'}`}
                  className={`rounded text-muted hover:text-ink ${focusRing}`}
                  onClick={() => setEvents(doc.keyEventKeys.filter((x) => x !== k))}
                >
                  ×
                </button>
              </span>
            ))}
            {events.length === 0 ? (
              <span className="text-faint">Add entries of an event type to the codex first.</span>
            ) : (
              <>
                <select
                  aria-label={`Key event to add to ${doc.title}`}
                  className={`h-8 rounded-md bg-sunk px-2 ${focusRing}`}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">Choose an event…</option>
                  {events
                    .filter((e) => !doc.keyEventKeys.includes(e.key))
                    .map((e) => (
                      <option key={e.key} value={e.key}>
                        {e.name}
                      </option>
                    ))}
                </select>
                <Button
                  disabled={!pick || save.isPending}
                  onClick={() => {
                    setEvents([...doc.keyEventKeys, pick]);
                    setPick('');
                  }}
                >
                  Add event
                </Button>
              </>
            )}
          </div>
        </>
      )}
      {save.error && (
        <p role="alert" className="text-sm text-bad">
          Couldn’t save: {save.error.message}
        </p>
      )}
    </section>
  );
}
