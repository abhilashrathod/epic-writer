import { z } from 'zod';
import { TYPE_COLORS } from './api';
import { storyTimeSchema } from './entity-fields';

const key = z.string().min(1).max(64);
const name = z.string().trim().min(1, 'Name the storyline').max(120);
const focus = z.array(key).max(50);
const description = z.string().max(2000);

/** A new storyline (GR-7): a thread of scenes such as "Karna's thread". */
export const storylineInput = z.object({
  name,
  color: z.enum(TYPE_COLORS).default('cat-1'),
  workKey: key.nullable().default(null),
  focusEntityKeys: focus.default([]),
  description: description.default(''),
});

/** Rename, recolour or re-scope a storyline; omitted fields stay as they are. */
export const storylinePatch = z
  .object({
    name,
    color: z.enum(TYPE_COLORS),
    workKey: key.nullable(),
    focusEntityKeys: focus,
    description,
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Change at least one field');

/** Hand-set scene tags: the storylines it belongs to and, in prose, whose point of view it is. */
export const sceneTagsInput = z
  .object({ storylineKeys: z.array(key).max(50), povEntityKey: key.nullable() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Change at least one tag');

export interface StorylineDto {
  key: string;
  name: string;
  color: (typeof TYPE_COLORS)[number];
  workKey: string | null;
  focusEntityKeys: string[];
  description: string;
}

/** One scene for the timeline and storyline views, with its episode or chapter. */
export interface SceneDto {
  sceneKey: string;
  workKey: string;
  documentKey: string;
  documentTitle: string;
  documentFormat: 'fountain' | 'markdown';
  documentStoryTime: z.infer<typeof storyTimeSchema> | null;
  order: string;
  heading: string;
  storyTime: z.infer<typeof storyTimeSchema> | null;
  storylineKeys: string[];
  povEntityKey: string | null;
  entityKeys: string[];
}
