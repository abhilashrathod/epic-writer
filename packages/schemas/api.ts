import { z } from 'zod';

export const createProjectBody = z.object({
  name: z.string().trim().min(1, 'Name the project').max(200, 'Keep the name under 200 characters'),
});

export const preferencesBody = z
  .object({
    skin: z.enum(['ink', 'sand']).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
  })
  .refine((v) => v.skin !== undefined || v.theme !== undefined, 'Send skin or theme');

export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
  commitCount: number;
}

export const WORK_MEDIA = [
  'series',
  'novel',
  'film',
  'trilogy',
  'short',
  'stage',
  'game',
  'other',
] as const;

export const createWorkBody = z.object({
  name: z.string().trim().min(1, 'Name the work').max(200),
  medium: z.enum(WORK_MEDIA),
});

export const createDocumentBody = z.object({
  workKey: z.string().min(1),
  parentKey: z.string().min(1).nullable(),
  title: z.string().trim().max(200).optional(),
});

export const updateDocumentBody = z.union([
  z.object({ title: z.string().trim().min(1, 'Title is empty').max(200) }),
  z.object({ move: z.enum(['up', 'down']) }),
]);

export interface WorkDto {
  key: string;
  name: string;
  medium: (typeof WORK_MEDIA)[number];
  levels: { key: string; singular: string; plural: string }[];
}

export interface DocumentDto {
  key: string;
  workKey: string;
  parentKey: string | null;
  levelKey: string;
  kind: 'container' | 'text';
  format: 'fountain' | 'markdown';
  title: string;
  number: number;
  orderPath: string;
}

export interface TreeDto {
  works: WorkDto[];
  documents: DocumentDto[];
}

export interface DocumentTextDto {
  document: DocumentDto;
  text: string;
  version: number;
}
