import { ObjectId, type Db } from 'mongodb';
import {
  documentVersions,
  readHeadByKey,
  readHeads,
  type EntityDoc,
  type EntityTypeDoc,
} from '@epic/db';
import { entityInput, PROMINENCE, type EntityInput } from '@epic/schemas/api';
import { entityFieldsSchema } from '@epic/schemas/entity-fields';
import { requireImageAssets } from './assets';
import { commit, versionBody, type Change } from './commit';
import { Invalid, NotFound } from './errors';
import { saveWorkingText } from './save';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'entry'
  );
}

/** A slug unique among live entries on the branch: "arjuna", then "arjuna-2"... */
function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Entries created earlier in the same commit (an accepted proposal), which references may name. */
export type PendingEntities = Map<string, { key: string; typeKey: string; name: string }>;

/**
 * Validates an entry against its type (AGENTS.md rule 8) and checks that every entry it references
 * exists and has an allowed type. Empty optional values are dropped rather than stored.
 */
async function validate(
  db: Db,
  ctx: ProjectContext,
  raw: unknown,
  selfKey?: string,
  pending?: PendingEntities,
) {
  const input = entityInput.parse(raw);
  const type = await readHeadByKey(db, 'entityTypes', ctx.scope, input.typeKey);
  if (!type) throw new Invalid('Pick an existing entry type');
  const known = new Set(type.fields.map((f) => f.key));
  const present = Object.fromEntries(
    Object.entries(input.fields).filter(([k, v]) => known.has(k) && !isEmpty(v)),
  );
  const parsed = entityFieldsSchema(type.fields).safeParse(present);
  if (!parsed.success) {
    // Name the field so the writer knows what to fix.
    const issue = parsed.error.issues[0]!;
    const label =
      type.fields.find((f) => f.key === issue.path[0])?.label ?? String(issue.path[0] ?? 'A field');
    throw new Invalid(issue.message.includes(label) ? issue.message : `${label}: ${issue.message}`);
  }
  const fields = parsed.data as Record<string, unknown>;

  // Entry images and image fields must be uploads of this project.
  const imageFieldIds = type.fields.flatMap((f) =>
    f.kind === 'image' && typeof fields[f.key] === 'string' ? [fields[f.key] as string] : [],
  );
  const imageIds = [...imageFieldIds, ...(input.images ?? []).map((i) => i.assetId)];
  if (imageIds.length) await requireImageAssets(db, ctx, imageIds);

  const refs = type.fields.flatMap((f) => {
    const v = fields[f.key];
    if (f.kind === 'entityRef' && typeof v === 'string') return [{ f, key: v }];
    if (f.kind === 'entityRefList' && Array.isArray(v))
      return (v as string[]).map((key) => ({ f, key }));
    return [];
  });
  if (refs.length) {
    const found = new Map(
      (await readHeads(db, 'entities', ctx.scope, { key: { $in: refs.map((r) => r.key) } })).map(
        (e) => [e.key, e],
      ),
    );
    for (const { f, key } of refs) {
      const target = found.get(key) ?? pending?.get(key);
      if (!target || key === selfKey)
        throw new Invalid(`"${f.label}" points to an entry that doesn't exist`);
      if (f.refTypeKeys.length && !f.refTypeKeys.includes(target.typeKey)) {
        throw new Invalid(`"${f.label}" can't point to "${target.name}"`);
      }
    }
  }
  return { input: { ...input, fields }, type };
}

export async function takenSlugs(db: Db, ctx: ProjectContext): Promise<Set<string>> {
  return new Set((await readHeads(db, 'entities', ctx.scope)).map((e) => e.slug));
}

const PROMINENCE_RANK = new Map<string, number>(PROMINENCE.map((p, i) => [p, i]));

/**
 * Entries on the branch. Scrapped entries are hidden unless asked for (CX-12). Sorted by
 * prominence, then name; entries of `event` types sort by their first date field instead.
 */
export async function listEntities(
  db: Db,
  ctx: ProjectContext,
  opts: { includeScrapped?: boolean } = {},
): Promise<EntityDoc[]> {
  const [entities, types] = await Promise.all([
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'entityTypes', ctx.scope),
  ]);
  const dateField = new Map<string, string | undefined>(
    types
      .filter((t) => t.traits.includes('event'))
      .map((t) => [t.key, t.fields.find((f) => f.kind === 'date')?.key]),
  );
  const when = (e: EntityDoc) => {
    const k = dateField.get(e.typeKey);
    const v = k ? (e.fields[k] as { start?: number } | undefined) : undefined;
    return typeof v?.start === 'number' ? v.start : Number.POSITIVE_INFINITY;
  };
  return entities
    .filter((e) => opts.includeScrapped || e.canonState !== 'scrapped')
    .sort((a, b) => {
      if (dateField.has(a.typeKey) && a.typeKey === b.typeKey)
        return when(a) - when(b) || a.name.localeCompare(b.name);
      return (
        (PROMINENCE_RANK.get(a.prominence) ?? 9) - (PROMINENCE_RANK.get(b.prominence) ?? 9) ||
        a.name.localeCompare(b.name)
      );
    });
}

export async function getEntity(
  db: Db,
  ctx: ProjectContext,
  key: string,
): Promise<{ entity: EntityDoc; type: EntityTypeDoc | null }> {
  const entity = await readHeadByKey(db, 'entities', ctx.scope, key);
  if (!entity) throw new NotFound('Entry not found');
  return { entity, type: await readHeadByKey(db, 'entityTypes', ctx.scope, entity.typeKey) };
}

function body(
  input: EntityInput & { fields: Record<string, unknown> },
  slug: string,
  prev?: EntityDoc,
  proposalId: ObjectId | null = null,
) {
  return {
    ...(prev
      ? versionBody(prev)
      : {
          images: [],
          storyTime: null,
          firstAppearances: [],
          origin: proposalId ? ('ai' as const) : ('user' as const),
          proposalId,
        }),
    typeKey: input.typeKey,
    name: input.name,
    slug,
    aliases: [...new Set(input.aliases.filter((a) => a !== input.name))],
    summary: input.summary,
    prominence: input.prominence,
    canonState: input.canonState,
    tags: [...new Set(input.tags)],
    fields: input.fields,
    images: input.images ? entryImages(input.images) : (prev?.images ?? []),
  };
}

/** One image per asset; exactly one primary when there are any (the first, unless one is marked). */
function entryImages(list: NonNullable<EntityInput['images']>): EntityDoc['images'] {
  const seen = new Set<string>();
  const unique = list.filter((i) => !seen.has(i.assetId) && seen.add(i.assetId));
  const primary = Math.max(
    0,
    unique.findIndex((i) => i.primary),
  );
  return unique.map((i, n) => ({
    assetId: new ObjectId(i.assetId),
    caption: i.caption,
    primary: n === primary,
  }));
}

/**
 * The validated change that creates an entry, or replaces `prev`, without committing it. Shared by
 * writer edits and accepted proposals. `taken` holds slugs in use; the new slug is added to it.
 */
export async function entityChange(
  db: Db,
  ctx: ProjectContext,
  raw: unknown,
  opts: {
    taken: Set<string>;
    prev?: EntityDoc;
    key?: string;
    pending?: PendingEntities;
    proposalId?: ObjectId;
  },
): Promise<{ change: Change; name: string; typeName: string }> {
  const { prev } = opts;
  const { input, type } = await validate(db, ctx, raw, prev?.key ?? opts.key, opts.pending);
  if (prev) opts.taken.delete(prev.slug);
  const slug = prev && input.name === prev.name ? prev.slug : uniqueSlug(input.name, opts.taken);
  opts.taken.add(slug);
  const data = body(input, slug, prev, opts.proposalId ?? null);
  const change: Change = prev
    ? { op: 'update', collection: 'entities', key: prev.key, data }
    : { op: 'create', collection: 'entities', key: opts.key, data };
  return { change, name: input.name, typeName: type.name };
}

export async function createEntity(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const { change, name, typeName } = await entityChange(db, ctx, raw, {
    taken: await takenSlugs(db, ctx),
  });
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Add ${typeName.toLowerCase()} "${name}"`,
    author: author(ctx),
    changes: [change],
  });
  return keys[0]!;
}

/** Replaces an entry's editable parts. Fields its type no longer defines are dropped. */
export async function updateEntity(
  db: Db,
  ctx: ProjectContext,
  key: string,
  raw: unknown,
): Promise<void> {
  const prev = await readHeadByKey(db, 'entities', ctx.scope, key);
  if (!prev) throw new NotFound('Entry not found');
  const { change, name } = await entityChange(db, ctx, raw, {
    taken: await takenSlugs(db, ctx),
    prev,
  });
  await commit(db, {
    ...ctx.scope,
    message: `Edit "${name}"`,
    author: author(ctx),
    changes: [change],
  });
}

export async function deleteEntity(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const prev = await readHeadByKey(db, 'entities', ctx.scope, key);
  if (!prev) throw new NotFound('Entry not found');
  await commit(db, {
    ...ctx.scope,
    message: `Delete "${prev.name}"`,
    author: author(ctx),
    changes: [{ op: 'delete', collection: 'entities', key }],
  });
}

/** Replaces every occurrence of one entry key with another inside a field value. */
function swapKey(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value) && value.includes(from))
    return [...new Set(value.map((v) => (v === from ? to : v)))];
  return value;
}

/**
 * Merges a duplicate into the entry to keep (CX-13), in one commit: the kept entry gains the
 * duplicate's name and aliases, tags, and any field it had left empty; references in other
 * entries, links and facts are redirected; the duplicate is deleted. Mentions in working texts
 * are then rewritten to point at the kept entry.
 */
export async function mergeEntities(
  db: Db,
  ctx: ProjectContext,
  input: { keepKey: string; mergeKey: string },
): Promise<{ textsUpdated: number }> {
  const { keepKey, mergeKey } = input;
  if (keepKey === mergeKey) throw new Invalid('Pick two different entries to merge');
  const [keep, dup] = await Promise.all([
    readHeadByKey(db, 'entities', ctx.scope, keepKey),
    readHeadByKey(db, 'entities', ctx.scope, mergeKey),
  ]);
  if (!keep || !dup) throw new NotFound('Entry not found');

  const fields = { ...keep.fields };
  if (keep.typeKey === dup.typeKey) {
    for (const [k, v] of Object.entries(dup.fields)) if (isEmpty(fields[k])) fields[k] = v;
  }
  for (const k of Object.keys(fields)) fields[k] = swapKey(fields[k], mergeKey, keepKey);
  const merged: Change = {
    op: 'update',
    collection: 'entities',
    key: keepKey,
    data: {
      ...versionBody(keep),
      aliases: [...new Set([...keep.aliases, dup.name, ...dup.aliases])].filter(
        (a) => a !== keep.name,
      ),
      tags: [...new Set([...keep.tags, ...dup.tags])],
      summary: keep.summary || dup.summary,
      fields,
    },
  };

  const changes: Change[] = [merged, { op: 'delete', collection: 'entities', key: mergeKey }];
  for (const e of await readHeads(db, 'entities', ctx.scope)) {
    if (e.key === keepKey || e.key === mergeKey) continue;
    const next = Object.fromEntries(
      Object.entries(e.fields).map(([k, v]) => [k, swapKey(v, mergeKey, keepKey)]),
    );
    if (JSON.stringify(next) !== JSON.stringify(e.fields)) {
      changes.push({
        op: 'update',
        collection: 'entities',
        key: e.key,
        data: { ...versionBody(e), fields: next },
      });
    }
  }
  for (const l of await readHeads(db, 'links', ctx.scope, {
    $or: [{ fromKey: mergeKey }, { toKey: mergeKey }],
  })) {
    const data = {
      ...versionBody(l),
      fromKey: swapKey(l.fromKey, mergeKey, keepKey),
      toKey: swapKey(l.toKey, mergeKey, keepKey),
    };
    changes.push({ op: 'update', collection: 'links', key: l.key, data });
  }
  for (const f of await readHeads(db, 'facts', ctx.scope, { entityKey: mergeKey })) {
    changes.push({
      op: 'update',
      collection: 'facts',
      key: f.key,
      data: { ...versionBody(f), entityKey: keepKey },
    });
  }
  await commit(db, {
    ...ctx.scope,
    message: `Merge "${dup.name}" into "${keep.name}"`,
    author: author(ctx),
    changes,
  });

  // Mentions live in plain-text working copies, outside the commit; each is saved like an edit.
  const needle = `[[@e:${mergeKey}|`;
  const texts = await documentVersions.findWorkingContaining(db, { ...ctx.scope, needle });
  for (const w of texts) {
    await saveWorkingText(db, ctx, {
      documentKey: w.documentKey,
      text: w.text.split(needle).join(`[[@e:${keepKey}|`),
      baseVersion: w.version,
    });
  }
  return { textsUpdated: texts.length };
}
