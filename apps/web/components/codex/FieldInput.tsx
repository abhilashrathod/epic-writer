'use client';

import type { StoryTimeShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto } from '@epic/schemas/api';
import { Button, focusRing } from '@epic/ui';
import type { TypesData } from '../../lib/use-types';
import { useWorkspace } from '../Workspace';
import { assetUrl } from './EntryImages';
import { ImageUploadButton } from './ImageUploadButton';
import { NarrativeRefInput } from './NarrativeRefInput';
import { StoryDateInput } from './StoryDateInput';

type FieldDef = EntityTypeDto['fields'][number];

const box = `h-10 w-full rounded-lg bg-sunk px-3 text-ink ${focusRing}`;

/** One field of an entry, with an input that matches its kind (CX-2). */
export function FieldInput(props: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  meta: TypesData;
  entries: EntityDto[];
  selfKey?: string;
}) {
  const { field: f, value, onChange } = props;
  const { projectId } = useWorkspace();
  const hint = f.timeVarying ? 'Starting value. Later changes are recorded on the timeline.' : null;
  const label = (
    <span className="text-sm font-medium">
      {f.label}
      {f.required && <span className="text-bad"> *</span>}
    </span>
  );
  const candidates = props.entries.filter(
    (e) =>
      e.key !== props.selfKey &&
      e.canonState !== 'scrapped' &&
      (!f.refTypeKeys.length || f.refTypeKeys.includes(e.typeKey)),
  );

  let control: React.ReactNode;
  switch (f.kind) {
    case 'text':
      control = (
        <input
          aria-label={f.label}
          className={box}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'richtext':
      control = (
        <textarea
          aria-label={f.label}
          rows={3}
          className={`${box} h-auto py-2`}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          aria-label={f.label}
          type="number"
          className={box}
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );
      break;
    case 'quantity': {
      const q = (value as { value: number; unitKey: string } | null) ?? null;
      const unit = q?.unitKey ?? props.meta.units[0]?.key ?? '';
      control = (
        <div className="flex gap-2">
          <input
            aria-label={f.label}
            type="number"
            className={box}
            value={q?.value ?? ''}
            onChange={(e) =>
              onChange(
                e.target.value === '' ? null : { value: Number(e.target.value), unitKey: unit },
              )
            }
          />
          <select
            aria-label={`${f.label}: unit`}
            className={`${box} w-auto`}
            value={unit}
            onChange={(e) => q && onChange({ ...q, unitKey: e.target.value })}
          >
            {props.meta.units.map((u) => (
              <option key={u.key} value={u.key}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      );
      break;
    }
    case 'date':
      return props.meta.calendar ? (
        <div className="flex flex-col gap-1">
          <StoryDateInput
            label={f.label}
            calendar={props.meta.calendar}
            value={(value as StoryTimeShape) ?? null}
            onChange={onChange}
          />
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      ) : null;
    case 'enum':
      control = (
        <select
          aria-label={f.label}
          className={box}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Not set</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    case 'multiEnum': {
      const set = new Set((value as string[]) ?? []);
      control = (
        <div className="flex flex-wrap gap-3">
          {f.options.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={set.has(o)}
                onChange={(e) =>
                  onChange(f.options.filter((x) => (x === o ? e.target.checked : set.has(x))))
                }
              />{' '}
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />{' '}
          {f.label}
        </label>
      );
    case 'entityRef':
      control = (
        <select
          aria-label={f.label}
          className={box}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">None</option>
          {candidates.map((e) => (
            <option key={e.key} value={e.key}>
              {e.name}
            </option>
          ))}
        </select>
      );
      break;
    case 'entityRefList': {
      const keys = (value as string[]) ?? [];
      const name = (k: string) => props.entries.find((e) => e.key === k)?.name ?? '(deleted entry)';
      control = (
        <div className="flex flex-col gap-2">
          {keys.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {keys.map((k) => (
                <li
                  key={k}
                  className="flex items-center gap-1 rounded-full bg-sunk py-0.5 pl-3 pr-1 text-sm"
                >
                  {name(k)}
                  <Button
                    className="h-6 px-1"
                    aria-label={`Remove ${name(k)} from ${f.label}`}
                    onClick={() => onChange(keys.filter((x) => x !== k))}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <select
            aria-label={`Add to ${f.label}`}
            className={box}
            value=""
            onChange={(e) => e.target.value && onChange([...keys, e.target.value])}
          >
            <option value="">Add…</option>
            {candidates
              .filter((e) => !keys.includes(e.key))
              .map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
          </select>
        </div>
      );
      break;
    }
    case 'narrativeRef':
    case 'narrativeRefList':
      control = <NarrativeRefInput field={f} value={value} onChange={onChange} />;
      break;
    case 'list':
      control = (
        <textarea
          aria-label={f.label}
          rows={3}
          className={`${box} h-auto py-2`}
          placeholder="One per line"
          value={((value as string[]) ?? []).join('\n')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
      break;
    case 'composition': {
      const rows = (value as { label: string; count: number }[]) ?? [];
      const setRow = (i: number, patch: Partial<{ label: string; count: number }>) =>
        onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
      control = (
        <div className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={`${f.label}: part ${i + 1}`}
                className={box}
                value={r.label}
                placeholder="e.g. Chariots"
                onChange={(e) => setRow(i, { label: e.target.value })}
              />
              <input
                aria-label={`${f.label}: count ${i + 1}`}
                type="number"
                min={0}
                className={`${box} w-28`}
                value={r.count}
                onChange={(e) => setRow(i, { count: Math.max(0, Number(e.target.value) || 0) })}
              />
              <Button
                aria-label={`Remove part ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            className="self-start"
            onClick={() => onChange([...rows, { label: '', count: 0 }])}
          >
            + Add part
          </Button>
        </div>
      );
      break;
    }
    case 'image':
      control = (
        <div className="flex items-end gap-3">
          {typeof value === 'string' && value && (
            <img
              src={assetUrl(projectId, value)}
              alt={f.label}
              className="h-24 w-24 rounded-lg bg-sunk object-cover"
            />
          )}
          <ImageUploadButton
            projectId={projectId}
            label={value ? `Replace ${f.label}` : `Upload ${f.label}`}
            onUploaded={(up) => onChange(up[0]?.id)}
          />
          {Boolean(value) && <Button onClick={() => onChange(undefined)}>Remove {f.label}</Button>}
        </div>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {control}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
