import type { Db } from 'mongodb';
import { readHeadByKey, readHeads, scenes, type SceneTags, type StorylineDoc } from '@epic/db';
import {
  sceneTagsInput,
  storylineInput,
  storylinePatch,
  type SceneDto,
  type StorylineDto,
} from '@epic/schemas/storylines';
import { commit, commitInSession, versionBody } from './commit';
import { Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

const toDto = (s: StorylineDoc): StorylineDto => ({
  key: s.key,
  name: s.name,
  color: s.color as StorylineDto['color'],
  workKey: s.workKey,
  focusEntityKeys: s.focusEntityKeys,
  description: s.description,
});

/** Storylines in the order they were created (keys are time-sortable). */
export async function listStorylines(db: Db, ctx: ProjectContext): Promise<StorylineDto[]> {
  const rows = await readHeads(db, 'storylines', ctx.scope);
  return rows.sort((a, b) => a.key.localeCompare(b.key)).map(toDto);
}

/** Throws Invalid unless every key names a live row of `collection`. */
async function requireKeys(
  db: Db,
  ctx: ProjectContext,
  collection: 'works' | 'entities' | 'storylines',
  keys: string[],
  message: string,
): Promise<void> {
  if (!keys.length) return;
  const found = await readHeads(db, collection, ctx.scope, { key: { $in: keys } });
  if (new Set(found.map((r) => r.key)).size !== new Set(keys).size) throw new Invalid(message);
}

async function checkRefs(
  db: Db,
  ctx: ProjectContext,
  p: { workKey?: string | null; focusEntityKeys?: string[] },
) {
  if (p.workKey) await requireKeys(db, ctx, 'works', [p.workKey], 'Pick an existing work');
  if (p.focusEntityKeys)
    await requireKeys(db, ctx, 'entities', p.focusEntityKeys, 'Pick existing entries to follow');
}

export async function createStoryline(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const input = storylineInput.parse(raw);
  await checkRefs(db, ctx, input);
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Create storyline "${input.name}"`,
    author: author(ctx),
    changes: [{ op: 'create', collection: 'storylines', data: input }],
  });
  return keys[0]!;
}

async function requireStoryline(db: Db, ctx: ProjectContext, key: string) {
  const row = await readHeadByKey(db, 'storylines', ctx.scope, key);
  if (!row) throw new NotFound('Storyline not found');
  return row;
}

/** Renames, recolours or re-scopes a storyline as a new version. */
export async function updateStoryline(
  db: Db,
  ctx: ProjectContext,
  key: string,
  raw: unknown,
): Promise<void> {
  const patch = storylinePatch.parse(raw);
  const row = await requireStoryline(db, ctx, key);
  await checkRefs(db, ctx, patch);
  await commit(db, {
    ...ctx.scope,
    message: `Edit storyline "${patch.name ?? row.name}"`,
    author: author(ctx),
    changes: [
      { op: 'update', collection: 'storylines', key, data: { ...versionBody(row), ...patch } },
    ],
  });
}

/** Deletes a storyline and untags its scenes in the same transaction. */
export async function deleteStoryline(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const row = await requireStoryline(db, ctx, key);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await commitInSession(db, session, {
        ...ctx.scope,
        message: `Delete storyline "${row.name}"`,
        author: author(ctx),
        changes: [{ op: 'delete', collection: 'storylines', key }],
      });
      await scenes.removeStoryline(db, { ...ctx.scope, storylineKey: key }, { session });
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Tags a scene with storylines and, for prose scenes, a point-of-view entry. Tags live on the
 * derived scene row and survive saves (see scenes.replaceForDocument).
 */
export async function tagScene(
  db: Db,
  ctx: ProjectContext,
  sceneKey: string,
  raw: unknown,
): Promise<void> {
  const input = sceneTagsInput.parse(raw);
  const scene = await scenes.findByKey(db, { ...ctx.scope, sceneKey });
  if (!scene) throw new NotFound('Scene not found. Save the document and try again.');
  const tags: SceneTags = {};
  if (input.storylineKeys) {
    tags.storylineKeys = [...new Set(input.storylineKeys)];
    await requireKeys(db, ctx, 'storylines', tags.storylineKeys, 'Pick existing storylines');
  }
  if (input.povEntityKey !== undefined) {
    if (input.povEntityKey) {
      const doc = await readHeadByKey(db, 'documents', ctx.scope, scene.documentKey);
      if (doc?.format !== 'markdown')
        throw new Invalid('Point of view is set on prose scenes only');
      await requireKeys(db, ctx, 'entities', [input.povEntityKey], 'Pick an existing entry');
    }
    tags.povEntityKey = input.povEntityKey;
  }
  await scenes.setTags(db, { ...ctx.scope, sceneKey }, tags);
}

/**
 * A work's scenes (or every work's) in narrative order, with their episode or chapter. Scenes
 * whose document is gone are left out.
 */
export async function listScenes(
  db: Db,
  ctx: ProjectContext,
  workKey?: string,
): Promise<SceneDto[]> {
  const [rows, docs] = await Promise.all([
    scenes.list(db, { ...ctx.scope, workKey }),
    readHeads(db, 'documents', ctx.scope, workKey ? { workKey } : {}),
  ]);
  const docOf = new Map(docs.map((d) => [d.key, d]));
  return rows.flatMap((s) => {
    const d = docOf.get(s.documentKey);
    if (!d) return [];
    return [
      {
        sceneKey: s.sceneKey,
        workKey: s.workKey,
        documentKey: s.documentKey,
        documentTitle: d.title,
        documentFormat: d.format,
        documentStoryTime: d.storyTime,
        order: s.order,
        heading: s.heading,
        storyTime: s.storyTime,
        storylineKeys: s.storylineKeys,
        povEntityKey: s.povEntityKey,
        entityKeys: s.entityKeys,
      },
    ];
  });
}
