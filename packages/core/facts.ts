import type { Db, ObjectId } from 'mongodb';
import { readHeadByKey, readHeads, type EntityDoc, type FactDoc, type LinkDoc } from '@epic/db';
import { factInput } from '@epic/schemas/api';
import { entityFieldsSchema } from '@epic/schemas/entity-fields';
import { commit, type Change } from './commit';
import type { PendingEntities } from './entities';
import { Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

/**
 * The validated change recording a change to a time-varying field (CX-3), without committing it.
 * The field must be marked "changes over time" on the entry's type, and the value is validated
 * like the field itself. `pending` entries are created in the same commit.
 */
export async function factChange(
  db: Db,
  ctx: ProjectContext,
  raw: unknown,
  opts: { pending?: PendingEntities; proposalId?: ObjectId } = {},
): Promise<{ change: Change; message: string }> {
  const input = factInput.parse(raw);
  const entity =
    (await readHeadByKey(db, 'entities', ctx.scope, input.entityKey)) ??
    opts.pending?.get(input.entityKey);
  if (!entity) throw new NotFound('Entry not found');
  const type = await readHeadByKey(db, 'entityTypes', ctx.scope, entity.typeKey);
  const field = type?.fields.find((f) => f.key === input.field);
  if (!field) throw new Invalid(`"${entity.name}" has no field "${input.field}"`);
  if (!field.timeVarying)
    throw new Invalid(
      `"${field.label}" doesn't change over time. Mark it so on the entry type first.`,
    );
  if (input.value === null || input.value === undefined || input.value === '')
    throw new Invalid(`Give "${field.label}" a value`);
  const parsed = entityFieldsSchema([{ ...field, required: true }]).safeParse({
    [field.key]: input.value,
  });
  if (!parsed.success)
    throw new Invalid(`${field.label}: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);

  const refs = [input.value, input.causeKey]
    .flat()
    .filter((v): v is string => typeof v === 'string');
  const wantsRefs = field.kind === 'entityRef' || field.kind === 'entityRefList';
  const keys = [
    ...(wantsRefs ? refs.filter((k) => k !== input.causeKey) : []),
    ...(input.causeKey ? [input.causeKey] : []),
  ];
  if (keys.length) {
    const found = new Set([
      ...(await readHeads(db, 'entities', ctx.scope, { key: { $in: keys } })).map((e) => e.key),
      ...(opts.pending?.keys() ?? []),
    ]);
    const missing = keys.find((k) => !found.has(k));
    if (missing)
      throw new Invalid(
        missing === input.causeKey
          ? 'The cause must be an existing entry'
          : `"${field.label}" points to an entry that doesn't exist`,
      );
  }

  const change: Change = {
    op: 'create',
    collection: 'facts',
    data: {
      entityKey: entity.key,
      field: field.key,
      value: parsed.data[field.key],
      storyTime: input.storyTime,
      narrativeRefs: input.narrativeRefs,
      causeKey: input.causeKey,
      accountKey: null,
      canonState: input.canonState,
      sourceRef: null,
      origin: opts.proposalId ? 'ai' : 'user',
      proposalId: opts.proposalId ?? null,
    },
  };
  return { change, message: `${entity.name}: ${field.label} changes` };
}

/** Records a change to a time-varying field (CX-3). */
export async function addFact(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const { change, message } = await factChange(db, ctx, raw);
  const { keys } = await commit(db, {
    ...ctx.scope,
    message,
    author: author(ctx),
    changes: [change],
  });
  return keys[0]!;
}

export async function deleteFact(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const fact = await readHeadByKey(db, 'facts', ctx.scope, key);
  if (!fact) throw new NotFound('Change not found');
  await commit(db, {
    ...ctx.scope,
    message: 'Remove a change',
    author: author(ctx),
    changes: [{ op: 'delete', collection: 'facts', key }],
  });
}

/** An entry's recorded changes in story-time order. */
export async function listFacts(
  db: Db,
  ctx: ProjectContext,
  entityKey: string,
): Promise<FactDoc[]> {
  const facts = await readHeads(db, 'facts', ctx.scope, { entityKey });
  return facts.sort((a, b) => a.storyTime.start - b.storyTime.start);
}

/**
 * The whole codex graph for time-aware views (GR-1 to GR-7), which resolve "as of" client-side.
 * Scrapped entries, links and facts are left out (AGENTS.md rule 9).
 */
export async function worldSnapshot(
  db: Db,
  ctx: ProjectContext,
): Promise<{ entities: EntityDoc[]; links: LinkDoc[]; facts: FactDoc[] }> {
  const [entities, links, facts] = await Promise.all([
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'links', ctx.scope),
    readHeads(db, 'facts', ctx.scope),
  ]);
  const live = (x: { canonState: string }) => x.canonState !== 'scrapped';
  const kept = entities.filter(live);
  const ids = new Set(kept.map((e) => e.key));
  return {
    entities: kept,
    links: links.filter((l) => live(l) && ids.has(l.fromKey) && ids.has(l.toKey)),
    facts: facts.filter((f) => live(f) && ids.has(f.entityKey)),
  };
}
