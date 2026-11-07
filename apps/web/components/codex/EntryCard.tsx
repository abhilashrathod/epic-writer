'use client';

import type { EntityDto, EntityTypeDto } from '@epic/schemas/api';
import { Card, Icon, TYPE_TEXT } from '@epic/ui';

export interface CardEntry {
  name: string;
  summary: string;
  prominence: EntityDto['prominence'];
  canonState: EntityDto['canonState'];
  aliases: string[];
  tags: string[];
}

/** One entry as a card: shared by the grid, the detail header and the live form preview. */
export function EntryCard({
  entry,
  type,
  selected = false,
}: {
  entry: CardEntry;
  type: EntityTypeDto | undefined;
  selected?: boolean;
}) {
  return (
    <Card
      selected={selected}
      className={`flex h-full flex-col gap-2 ${entry.canonState === 'scrapped' ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 text-sm">
        <Icon
          name={type?.icon ?? 'circle'}
          className={selected ? '' : TYPE_TEXT[type?.color ?? 'cat-8']}
        />
        <span className={selected ? 'opacity-80' : 'text-muted'}>
          {type?.name ?? 'Unknown type'}
        </span>
        {entry.canonState !== 'canon' && (
          <span
            className={`ml-auto rounded-full px-2 text-xs ${selected ? 'bg-surface text-ink' : entry.canonState === 'scrapped' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'}`}
          >
            {entry.canonState}
          </span>
        )}
      </div>
      <p className={`font-semibold leading-tight ${entry.prominence === 'main' ? 'text-lg' : ''}`}>
        {entry.name || 'Untitled'}
      </p>
      {entry.aliases.length > 0 && (
        <p className={`text-xs ${selected ? 'opacity-80' : 'text-muted'}`}>
          also {entry.aliases.join(', ')}
        </p>
      )}
      {entry.summary && (
        <p className={`line-clamp-3 text-sm ${selected ? 'opacity-90' : 'text-muted'}`}>
          {entry.summary}
        </p>
      )}
      {entry.tags.length > 0 && (
        <p className="mt-auto flex flex-wrap gap-1 pt-1">
          {entry.tags.map((t) => (
            <span
              key={t}
              className={`rounded-full px-2 text-xs ${selected ? 'bg-surface text-ink' : 'bg-sunk text-muted'}`}
            >
              {t}
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}
