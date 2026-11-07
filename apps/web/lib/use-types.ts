'use client';

import { useQuery } from '@tanstack/react-query';
import type { CalendarShape } from '@epic/core/calendar';
import type { EntityDto, EntityTypeDto, LinkTypeDto } from '@epic/schemas/api';
import { api } from './api-client';

export interface TypesData {
  groups: { key: string; name: string; order: number }[];
  types: EntityTypeDto[];
  units: { key: string; name: string; abbr: string; toBase: number }[];
  calendar: CalendarShape | null;
}

export const typesKey = (projectId: string) => ['types', projectId] as const;

export function useTypes(projectId: string) {
  return useQuery({
    queryKey: typesKey(projectId),
    queryFn: () => api<TypesData>(`/api/projects/${projectId}/entity-types`),
  });
}

/** camelCase key from a label, unique among `taken`: "Uses left" → "usesLeft". */
export function fieldKeyFrom(label: string, taken: Set<string>): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let key = words
    .map((w, i) => (i ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
  if (!/^[a-z]/.test(key)) key = `f${key}`;
  key = key.slice(0, 36);
  let out = key;
  for (let n = 2; taken.has(out); n++) out = `${key}${n}`;
  return out;
}

export const entitiesKey = (projectId: string) => ['entities', projectId] as const;

/** Every entry including scrapped ones; views filter. Small enough to hold client-side in Phase 1. */
export function useEntities(projectId: string) {
  return useQuery({
    queryKey: entitiesKey(projectId),
    queryFn: () =>
      api<{ entities: EntityDto[] }>(`/api/projects/${projectId}/entities?scrapped=1`).then(
        (r) => r.entities,
      ),
  });
}

export const linkTypesKey = (projectId: string) => ['linkTypes', projectId] as const;

export function useLinkTypes(projectId: string) {
  return useQuery({
    queryKey: linkTypesKey(projectId),
    queryFn: () =>
      api<{ linkTypes: LinkTypeDto[] }>(`/api/projects/${projectId}/link-types`).then(
        (r) => r.linkTypes,
      ),
  });
}

export const relationsKey = (projectId: string, key: string) =>
  ['relations', projectId, key] as const;
