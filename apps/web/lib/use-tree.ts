'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TreeDto } from '@epic/schemas/api';
import { api } from './api-client';

export const treeKey = (projectId: string) => ['tree', projectId] as const;

export function useTree(projectId: string) {
  return useQuery({
    queryKey: treeKey(projectId),
    queryFn: () => api<TreeDto>(`/api/projects/${projectId}/tree`),
  });
}

/** A mutation against the project API that refreshes the tree when it succeeds. */
export function useTreeMutation<V>(projectId: string, request: (vars: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => qc.invalidateQueries({ queryKey: treeKey(projectId) }),
  });
}
