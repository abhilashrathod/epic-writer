'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { EntityDto, EntityTypeDto } from '@epic/schemas/api';
import { focusRing } from '@epic/ui';
import { EntryCard } from './codex/EntryCard';

/** The card that opens when a mention is clicked (ED-6). Esc or a click elsewhere closes it. */
export function MentionCard(props: {
  projectId: string;
  entry: EntityDto | undefined;
  type: EntityTypeDto | undefined;
  rect: DOMRect;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && props.onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    box.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [props]);

  const top = Math.min(props.rect.bottom + 8, window.innerHeight - 260);
  const left = Math.min(props.rect.left, window.innerWidth - 336);
  return (
    <div
      ref={box}
      role="dialog"
      aria-label={props.entry ? `Card for ${props.entry.name}` : 'Deleted entry'}
      className="fixed z-50 flex w-80 flex-col gap-2 rounded-xl bg-panel p-2 shadow-lg"
      style={{ top, left }}
    >
      {props.entry ? (
        <>
          <EntryCard entry={props.entry} type={props.type} />
          <Link
            href={`/projects/${props.projectId}/codex?e=${props.entry.key}`}
            className={`self-start rounded-md px-2 py-1 text-sm text-muted hover:text-ink ${focusRing}`}
          >
            Open in codex →
          </Link>
        </>
      ) : (
        <p className="p-2 text-sm text-muted">
          This entry was deleted or merged away. Re-link the mention by typing @ and choosing an
          entry.
        </p>
      )}
    </div>
  );
}
