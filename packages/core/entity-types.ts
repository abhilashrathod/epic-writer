import type { Db } from 'mongodb';
import { readHeadByKey, readHeads, type EntityTypeDoc } from '@epic/db';
import { entityTypeInput, type EntityTypeInput } from '@epic/schemas/api';
import { commit, versionBody } from './commit';
import { Conflict, Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

/** Entry types on the branch, by group order, then type order. */
export async function listEntityTypes(db: Db, ctx: ProjectContext): Promise<EntityTypeDoc[]> {
  const groupOrder = new Map(ctx.project.typeGroups.map((g) => [g.key, g.order]));
  const types = await readHeads(db, 'entityTypes', ctx.scope);
  return types.sort(
    (a, b) =>
      (groupOrder.get(a.group) ?? 99) - (groupOrder.get(b.group) ?? 99) || a.order - b.order,
  );
}

/** Parses input and checks that every type it points at exists. */
async function validate(
  db: Db,
  ctx: ProjectContext,
  raw: unknown,
  selfKey?: string,
): Promise<EntityTypeInput> {
  const input = entityTypeInput.parse(raw);
  if (!ctx.project.typeGroups.some((g) => g.key === input.group))
    throw new Invalid(`Unknown group "${input.group}"`);
  const known = new Set((await readHeads(db, 'entityTypes', ctx.scope)).map((t) => t.key));
  if (selfKey) known.add(selfKey);
  if (input.parentTypeKey && (!known.has(input.parentTypeKey) || input.parentTypeKey === selfKey)) {
    throw new Invalid('Pick an existing parent type other than this one');
  }
  for (const f of input.fields) {
    const missing = f.refTypeKeys.find((k) => !known.has(k));
    if (missing) throw new Invalid(`"${f.label}" refers to a type that doesn't exist`);
  }
  return input;
}

export async function createEntityType(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const input = await validate(db, ctx, raw);
  const order = (await readHeads(db, 'entityTypes', ctx.scope)).length;
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Create entry type "${input.name}"`,
    author: author(ctx),
    changes: [{ op: 'create', collection: 'entityTypes', data: { ...input, order } }],
  });
  return keys[0]!;
}

/**
 * Replaces a type's definition. Entries keep their stored values; fields removed here simply stop
 * showing, and entries are re-validated against the new definition when next edited.
 */
export async function updateEntityType(
  db: Db,
  ctx: ProjectContext,
  key: string,
  raw: unknown,
): Promise<void> {
  const head = await readHeadByKey(db, 'entityTypes', ctx.scope, key);
  if (!head) throw new NotFound('Entry type not found');
  const input = await validate(db, ctx, raw, key);
  await commit(db, {
    ...ctx.scope,
    message: `Edit entry type "${input.name}"`,
    author: author(ctx),
    changes: [
      { op: 'update', collection: 'entityTypes', key, data: { ...versionBody(head), ...input } },
    ],
  });
}

/** Deletes a type that no entry, child type or field still uses. */
export async function deleteEntityType(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const head = await readHeadByKey(db, 'entityTypes', ctx.scope, key);
  if (!head) throw new NotFound('Entry type not found');
  const [entries, types] = await Promise.all([
    readHeads(db, 'entities', ctx.scope, { typeKey: key }),
    readHeads(db, 'entityTypes', ctx.scope),
  ]);
  if (entries.length) {
    throw new Conflict(
      `${entries.length} ${entries.length === 1 ? 'entry uses' : 'entries use'} "${head.name}". Move or delete them first.`,
    );
  }
  const user = types.find(
    (t) =>
      t.key !== key &&
      (t.parentTypeKey === key || t.fields.some((f) => f.refTypeKeys.includes(key))),
  );
  if (user)
    throw new Conflict(`"${user.name}" refers to "${head.name}". Remove that reference first.`);
  await commit(db, {
    ...ctx.scope,
    message: `Delete entry type "${head.name}"`,
    author: author(ctx),
    changes: [{ op: 'delete', collection: 'entityTypes', key }],
  });
}
