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
