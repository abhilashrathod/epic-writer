'use client';

import { formatStoryTime, type CalendarShape, type StoryTimeShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto } from '@epic/schemas/api';
import { useWorkspace } from '../Workspace';
import { assetUrl } from './EntryImages';
import { NarrativeRefList } from './NarrativeRefList';

type FieldDef = EntityTypeDto['fields'][number];

/** Read-only display of one field value; entry references become buttons that open that entry. */
export function FieldValue(props: {
  field: FieldDef;
  value: unknown;
  calendar: CalendarShape | null;
  units: { key: string; abbr: string }[];
  entries: EntityDto[];
  onOpen: (key: string) => void;
}) {
  const { field: f, value: v } = props;
  const { projectId } = useWorkspace();
  const ref = (k: string) => {
    const e = props.entries.find((x) => x.key === k);
    return e ? (
      <button
        key={k}
        className="underline decoration-dotted underline-offset-2 hover:text-muted"
        onClick={() => props.onOpen(k)}
      >
        {e.name}
      </button>
    ) : (
      <span key={k} className="text-faint">
        (deleted entry)
      </span>
    );
  };
  switch (f.kind) {
    case 'date':
      return <>{props.calendar ? formatStoryTime(props.calendar, v as StoryTimeShape) : '—'}</>;
    case 'boolean':
      return <>{v ? 'Yes' : 'No'}</>;
    case 'quantity': {
      const q = v as { value: number; unitKey: string };
      return (
        <>
          {q.value} {props.units.find((u) => u.key === q.unitKey)?.abbr ?? q.unitKey}
        </>
      );
    }
    case 'entityRef':
      return ref(v as string);
    case 'entityRefList':
      return <span className="flex flex-wrap gap-x-2">{(v as string[]).map(ref)}</span>;
    case 'multiEnum':
    case 'list':
      return <>{(v as string[]).join(', ')}</>;
    case 'composition':
      return (
        <>
          {(v as { label: string; count: number }[])
            .map((r) => `${r.count.toLocaleString()} ${r.label}`)
            .join(' · ')}
        </>
      );
    case 'narrativeRef':
    case 'narrativeRefList':
      return <NarrativeRefList value={v} />;
    case 'richtext':
      return <span className="whitespace-pre-wrap">{String(v)}</span>;
    case 'image':
      return (
        <img
          src={assetUrl(projectId, String(v))}
          alt={f.label}
          className="max-h-48 rounded-lg bg-sunk object-contain"
        />
      );
    default:
      return <>{String(v)}</>;
  }
}
