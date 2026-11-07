import type { Db } from 'mongodb';
import { readHeadByKey, readHeads, scenes as sceneRows, type LinkTypeDoc } from '@epic/db';
import { linkInput, linkTypeInput, type ConnectionDto, type RelationsDto } from '@epic/schemas/api';
import { commit } from './commit';
import { Conflict, Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

export function listLinkTypes(db: Db, ctx: ProjectContext): Promise<LinkTypeDoc[]> {
  return readHeads(db, 'linkTypes', ctx.scope);
}

export async function createLinkType(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const input = linkTypeInput.parse(raw);
  const known = new Set((await readHeads(db, 'entityTypes', ctx.scope)).map((t) => t.key));
  if ([...input.fromTypeKeys, ...input.toTypeKeys].some((k) => !known.has(k)))
    throw new Invalid('Pick existing entry types');
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Create connection type "${input.label}"`,
    author: author(ctx),
    changes: [{ op: 'create', collection: 'linkTypes', data: { ...input, fields: [] } }],
  });
  return keys[0]!;
}

/** Whether a link type may join these two entry types, in either direction if symmetric. */
function allows(t: LinkTypeDoc, fromType: string, toType: string): boolean {
  const ok = (a: string, b: string) =>
    (!t.fromTypeKeys.length || t.fromTypeKeys.includes(a)) &&
    (!t.toTypeKeys.length || t.toTypeKeys.includes(b));
  return ok(fromType, toType) || (t.symmetric && ok(toType, fromType));
}

/** Connects two entries. The link's kind is copied from its type, as the data model requires. */
export async function createLink(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const input = linkInput.parse(raw);
  if (input.fromKey === input.toKey) throw new Invalid('An entry can’t be connected to itself');
  const [type, from, to] = await Promise.all([
    readHeadByKey(db, 'linkTypes', ctx.scope, input.typeKey),
    readHeadByKey(db, 'entities', ctx.scope, input.fromKey),
    readHeadByKey(db, 'entities', ctx.scope, input.toKey),
  ]);
  if (!type) throw new Invalid('Pick an existing kind of connection');
  if (!from || !to) throw new NotFound('Entry not found');
  if (!allows(type, from.typeKey, to.typeKey))
    throw new Invalid(`"${from.name}" can’t be ${type.label} "${to.name}"`);
  const dupe = await readHeads(db, 'links', ctx.scope, {
    typeKey: type.key,
    $or: [
      { fromKey: from.key, toKey: to.key },
      ...(type.symmetric ? [{ fromKey: to.key, toKey: from.key }] : []),
    ],
  });
  if (dupe.length) throw new Conflict(`"${from.name}" is already ${type.label} "${to.name}"`);
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Connect "${from.name}" ${type.label} "${to.name}"`,
    author: author(ctx),
    changes: [
      {
        op: 'create',
        collection: 'links',
        data: {
          fromKey: from.key,
          toKey: to.key,
          typeKey: type.key,
          kind: type.kind,
          fields: {},
          storyTime: null,
          narrativeRefs: [],
          accountKey: null,
          canonState: input.canonState,
          weight: 1,
          note: input.note,
          sourceRef: null,
          origin: 'user',
          proposalId: null,
        },
      },
    ],
  });
  return keys[0]!;
}

export async function deleteLink(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const link = await readHeadByKey(db, 'links', ctx.scope, key);
  if (!link) throw new NotFound('Connection not found');
  await commit(db, {
    ...ctx.scope,
    message: 'Remove a connection',
    author: author(ctx),
    changes: [{ op: 'delete', collection: 'links', key }],
  });
}

/**
 * Everything that relates to one entry: its connections read from its side, the entries whose
 * fields point at it, and every scene that mentions it. Scrapped links and entries are left out.
 */
export async function entityRelations(
  db: Db,
  ctx: ProjectContext,
  key: string,
): Promise<RelationsDto> {
  const entity = await readHeadByKey(db, 'entities', ctx.scope, key);
  if (!entity) throw new NotFound('Entry not found');
  const [links, types, entities, documents, scenes] = await Promise.all([
    readHeads(db, 'links', ctx.scope, { $or: [{ fromKey: key }, { toKey: key }] }),
    readHeads(db, 'linkTypes', ctx.scope),
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'documents', ctx.scope),
    sceneRows.listForEntity(db, { ...ctx.scope, entityKey: key }),
  ]);
  const typeOf = new Map(types.map((t) => [t.key, t]));
  const connections: ConnectionDto[] = links
    .filter((l) => l.canonState !== 'scrapped')
    .map((l) => {
      const t = typeOf.get(l.typeKey);
      const outgoing = l.fromKey === key;
      return {
        key: l.key,
        kind: l.kind,
        label: (outgoing || t?.symmetric ? t?.label : t?.inverseLabel) ?? l.kind,
        otherKey: outgoing ? l.toKey : l.fromKey,
        note: l.note,
        canonState: l.canonState,
      };
    });

  const entityTypes = await readHeads(db, 'entityTypes', ctx.scope);
  const fieldsOf = new Map(entityTypes.map((t) => [t.key, t.fields]));
  const referencedBy = entities
    .filter((e) => e.key !== key && e.canonState !== 'scrapped')
    .flatMap((e) =>
      (fieldsOf.get(e.typeKey) ?? [])
        .filter((f) => {
          const v = e.fields[f.key];
          return v === key || (Array.isArray(v) && v.includes(key));
        })
        .map((f) => ({ entityKey: e.key, fieldLabel: f.label })),
    );

  const title = new Map(documents.map((d) => [d.key, d.title]));
  const appearances = scenes.map((s) => ({
    documentKey: s.documentKey,
    documentTitle: title.get(s.documentKey) ?? 'Untitled',
    sceneKey: s.sceneKey,
    heading: s.heading,
    order: s.order,
  }));
  return { connections, referencedBy, appearances };
}
