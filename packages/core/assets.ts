import { ObjectId, type Db } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import { assets, type AssetDoc } from '@epic/db';
import { Invalid, NotFound } from './errors';
import type { Storage } from './storage';
import type { ProjectContext } from './works';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const prefix = (ctx: ProjectContext) => `projects/${ctx.project._id.toHexString()}/`;

/** Step 1 of an image upload: a fresh storage key and a signed URL the browser PUTs the file to. */
export async function startImageUpload(
  storage: Storage,
  ctx: ProjectContext,
  input: { mime: string; size: number },
): Promise<{ storageKey: string; uploadUrl: string }> {
  if (!(IMAGE_TYPES as readonly string[]).includes(input.mime))
    throw new Invalid('Upload a PNG, JPEG, WebP or GIF image');
  if (input.size > MAX_IMAGE_BYTES) throw new Invalid('Images can be at most 10 MB');
  const storageKey = `${prefix(ctx)}${uuidv7()}`;
  return { storageKey, uploadUrl: await storage.uploadUrl(storageKey, input.mime) };
}

/**
 * Step 2: checks the uploaded object really is there, is an allowed image and not too big, then
 * records it as an asset. Finishing the same upload twice returns the same asset.
 */
export async function finishImageUpload(
  db: Db,
  storage: Storage,
  ctx: ProjectContext,
  input: { storageKey: string; width: number | null; height: number | null },
): Promise<AssetDoc> {
  if (!input.storageKey.startsWith(prefix(ctx)))
    throw new Invalid('That upload isn’t from this project');
  const existing = await assets.findByStorageKey(db, ctx.project._id, input.storageKey);
  if (existing) return existing;
  const stored = await storage.head(input.storageKey);
  if (!stored) throw new NotFound('The upload didn’t arrive. Try again.');
  if (stored.size > MAX_IMAGE_BYTES || !(IMAGE_TYPES as readonly string[]).includes(stored.mime)) {
    await storage.remove(input.storageKey);
    throw new Invalid('Upload a PNG, JPEG, WebP or GIF image of at most 10 MB');
  }
  return assets.insert(db, {
    projectId: ctx.project._id,
    kind: 'image',
    storageKey: input.storageKey,
    mime: stored.mime,
    size: stored.size,
    width: input.width,
    height: input.height,
    origin: 'upload',
  });
}

/** A short-lived URL showing one of the project's assets. */
export async function assetViewUrl(
  db: Db,
  storage: Storage,
  ctx: ProjectContext,
  assetId: string,
): Promise<string> {
  const asset = ObjectId.isValid(assetId)
    ? await assets.find(db, ctx.project._id, new ObjectId(assetId))
    : null;
  if (!asset) throw new NotFound('Image not found');
  return storage.viewUrl(asset.storageKey);
}

/** Throws unless every id names an image asset of this project. Returns them as ObjectIds. */
export async function requireImageAssets(
  db: Db,
  ctx: ProjectContext,
  ids: string[],
): Promise<ObjectId[]> {
  const unique = [...new Set(ids)];
  if (unique.some((id) => !ObjectId.isValid(id))) throw new Invalid('Unknown image');
  const oids = unique.map((id) => new ObjectId(id));
  const found = await assets.findMany(db, ctx.project._id, oids);
  if (found.filter((a) => a.kind === 'image').length !== oids.length)
    throw new Invalid('One of those images isn’t in this project');
  return oids;
}
