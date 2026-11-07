import { z } from 'zod';

/** A Fountain file read as text in the browser and posted as JSON (IO-2). */
export const importFountainBody = z.object({
  workKey: z.string().min(1),
  parentKey: z.string().min(1).nullable(),
  fileName: z.string().max(255),
  text: z.string().max(5_000_000, 'This file is too large to import (5 MB of text at most)'),
});
export type ImportFountainBody = z.infer<typeof importFountainBody>;
