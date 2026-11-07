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

export interface Life {
  status: 'unborn' | 'alive' | 'dead';
  age: number | null;
}

const lifeText = ({ status, age }: Life) =>
  status === 'unborn'
    ? 'unborn'
    : status === 'dead'
      ? age === null
        ? 'dead'
        : `Died at ${age}`
      : age === null
        ? null
        : `Age ${age}`;

/**
 * One entry as a card: shared by the grid, the detail header and the live form preview. `life` is
 * the age and life status of a `born` entry as of the current point (GR-6); unborn entries fade.
 */
export function EntryCard({
  entry,
  type,
  selected = false,
  life,
  imageUrl,
}: {
  entry: CardEntry;
  type: EntityTypeDto | undefined;
  selected?: boolean;
  life?: Life;
  /** The entry's primary image (CX-5), shown at the top of the card. */
  imageUrl?: string;
}) {
  const fade = entry.canonState === 'scrapped' || life?.status === 'unborn';
  const lifeLine = life && lifeText(life);
  return (
    <Card selected={selected} className={`flex h-full flex-col gap-2 ${fade ? 'opacity-60' : ''}`}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="aspect-video w-full rounded-lg bg-sunk object-cover"
        />
      )}
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
      {lifeLine && (
        <p className={`text-xs ${selected ? 'opacity-80' : 'text-muted'}`}>{lifeLine}</p>
      )}
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
