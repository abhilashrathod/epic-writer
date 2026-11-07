'use client';

import { useQuery } from '@tanstack/react-query';
import type { WorldDto } from '@epic/schemas/api';
import { api } from './api-client';

export const worldKey = (projectId: string) => ['world', projectId] as const;

/**
 * Entries, links and facts for time-aware views. Resolve "as of" with @epic/core/asof against
 * `useWorkspace().asOf`. Invalidate `worldKey` after any change to entries, links or facts.
 */
export function useWorld(projectId: string) {
  return useQuery({
    queryKey: worldKey(projectId),
    queryFn: () => api<WorldDto>(`/api/projects/${projectId}/world`),
  });
}
