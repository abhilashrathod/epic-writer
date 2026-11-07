'use client';

import { useQuery } from '@tanstack/react-query';
import type { EntityTypeDto } from '@epic/schemas/api';
import { api } from './api-client';

export interface TypesData {
  groups: { key: string; name: string; order: number }[];
  types: EntityTypeDto[];
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
