import type { Db } from 'mongodb';
import { v7 as uuidv7 } from 'uuid';
import { projects, readHeads, type EntityTypeDoc, type ProjectDoc } from '@epic/db';
import { fieldAi } from '@epic/schemas';
import { entityTypeInput, type TypeTemplateDto } from '@epic/schemas/api';
import { commit, versionBody, type Change } from './commit';
import { NotFound } from './errors';
import { TYPE_CATALOGUE, type CatalogueField, type CatalogueType } from './type-catalogue';
import type { ProjectContext } from './works';

type KnownType = Pick<EntityTypeDoc, 'key' | 'name' | 'traits'>;

const norm = (s: string) => s.trim().toLowerCase();
const TEMPLATE_NAMES: Record<string, string> = {
  M: 'Mythological',
  F: 'Fantasy',
  S: 'Space opera',
};
// What the built-in project templates call these types.
const ALIASES: Record<string, string[]> = {
  'kingdom-nation-territory': ['realm'],
  'dynasty-noble-house': ['house'],
  'force-army-fleet': ['army'],
  'historical-event': ['event'],
  'vehicle-ship': ['ship'],
};
// Their short names mean something else: a fantasy "Realm" is a kingdom, a "Vehicle" one machine.
const NO_SHORT_NAME = new Set(['realm-plane-of-existence', 'vehicle-ship-class']);

function namesOf(c: CatalogueType): string[] {
  const short = NO_SHORT_NAME.has(c.id) ? [] : [norm(c.name.split('/')[0]!)];
  return [norm(c.name), ...short, ...(ALIASES[c.id] ?? [])];
}

/** Which project type, if any, already stands for each catalogue type (matched by name). */
function matchCatalogue<T extends KnownType>(types: T[]): Map<string, T> {
  const byName = new Map(types.map((t) => [norm(t.name), t]));
  const out = new Map<string, T>();
  for (const c of TYPE_CATALOGUE) {
    const hit = namesOf(c)
      .map((n) => byName.get(n))
      .find(Boolean);
    if (hit) out.set(c.id, hit);
  }
  return out;
}

const resolver = (known: KnownType[]) => {
  const matched = matchCatalogue(known);
  return (refs: string[]) => [
    ...new Set(
      refs.flatMap((r) =>
        r === '@geo'
          ? known.filter((t) => t.traits.includes('geo')).map((t) => t.key)
          : [matched.get(r)?.key].filter((k): k is string => !!k),
      ),
    ),
  ];
};

function toField(f: CatalogueField, resolve: (refs: string[]) => string[]) {
  return {
    key: f.key,
    label: f.label,
    kind: f.kind,
    options: f.options ?? [],
    required: false,
    timeVarying: f.timeVarying ?? false,
    // Until a target type is in the project, an empty list lets the field point at any entry.
    refTypeKeys: f.refs?.length ? resolve(f.refs) : [],
    ai: f.ai,
  };
}

function missingFields(c: CatalogueType, head: EntityTypeDoc): CatalogueField[] {
  const keys = new Set(head.fields.map((f) => f.key));
  const labels = new Set(head.fields.map((f) => norm(f.label)));
  return c.fields.filter((f) => !keys.has(f.key) && !labels.has(norm(f.label)));
}

/** The catalogue as the picker shows it, with what each template would add to this project. */
export async function listTypeTemplates(db: Db, ctx: ProjectContext): Promise<TypeTemplateDto[]> {
  const matched = matchCatalogue(await readHeads(db, 'entityTypes', ctx.scope));
  return TYPE_CATALOGUE.map((c) => {
    const head = matched.get(c.id);
    const templates = c.templates.map((t) => TEMPLATE_NAMES[t]!);
    return {
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      group: c.group,
      templates,
      fieldCount: c.fields.length,
      existingKey: head?.key ?? null,
      missingFieldCount: head ? missingFields(c, head).length : c.fields.length,
      search: norm(
        [
          c.name,
          c.description,
          c.group,
          ...templates,
          ...c.fields.flatMap((f) => [f.label, ...(f.options ?? [])]),
        ].join(' '),
      ),
    };
  });
}

/** Makes room for what a template needs: its sidebar group and, for quantities, one unit. */
async function prepareProject(
  db: Db,
  ctx: ProjectContext,
  fields: CatalogueField[],
  group?: string,
): Promise<void> {
  const { typeGroups, units } = ctx.project;
  const patch: Partial<Pick<ProjectDoc, 'typeGroups' | 'units'>> = {};
  if (group && !typeGroups.some((g) => g.key === norm(group))) {
    const order = Math.max(-1, ...typeGroups.map((g) => g.order)) + 1;
    patch.typeGroups = [...typeGroups, { key: norm(group), name: group, order }];
  }
  // A quantity with no unit to pick would fail validation when the entry is saved.
  if (!units.length && fields.some((f) => f.kind === 'quantity'))
    patch.units = [{ key: 'km', name: 'Kilometre', abbr: 'km', toBase: 1 }];
  if (Object.keys(patch).length) await projects.setFields(db, ctx.project._id, patch);
}

/** Existing types whose catalogue fields point at the new type start offering it as a target. */
function linkExistingTypes(heads: EntityTypeDoc[], c: CatalogueType, newKey: string): Change[] {
  const matched = matchCatalogue(heads);
  const isGeo = c.traits.includes('geo');
  return TYPE_CATALOGUE.flatMap((other): Change[] => {
    const head = matched.get(other.id);
    if (!head) return [];
    const catalogueFields = new Map(other.fields.map((f) => [f.key, f]));
    let changed = false;
    const fields = head.fields.map((f) => {
      const refs = catalogueFields.get(f.key)?.refs ?? [];
      if (!(refs.includes(c.id) || (isGeo && refs.includes('@geo')))) return f;
      if (f.refTypeKeys.includes(newKey)) return f;
      changed = true;
      return { ...f, refTypeKeys: [...f.refTypeKeys, newKey] };
    });
    return changed
      ? [
          {
            op: 'update',
            collection: 'entityTypes',
            key: head.key,
            data: { ...versionBody(head), fields },
          },
        ]
      : [];
  });
}

/**
 * Puts a catalogue type in the project and returns its key, ready for a new entry. A type the
 * project already has only gains the fields it lacks; nothing it holds is changed.
 */
export async function applyTypeTemplate(db: Db, ctx: ProjectContext, id: string): Promise<string> {
  const c = TYPE_CATALOGUE.find((t) => t.id === id);
  if (!c) throw new NotFound('Template not found');
  const heads = await readHeads(db, 'entityTypes', ctx.scope);
  const author = { kind: 'user' as const, userId: ctx.userId };
  const head = matchCatalogue(heads).get(id);

  if (head) {
    const missing = missingFields(c, head);
    // An older or built-in type may not have a description yet; never replace the writer's own.
    const description = head.description?.trim() || c.description;
    if (!missing.length && description === head.description) return head.key;
    await prepareProject(db, ctx, missing);
    const resolve = resolver(heads);
    const input = entityTypeInput.parse({
      ...versionBody(head),
      description,
      fields: [
        ...head.fields.map((f) => ({ ...f, ai: fieldAi(f) })),
        ...missing.map((f) => toField(f, resolve)),
      ],
    });
    await commit(db, {
      ...ctx.scope,
      message: `Add template fields to "${head.name}"`,
      author,
      changes: [
        {
          op: 'update',
          collection: 'entityTypes',
          key: head.key,
          data: { ...versionBody(head), ...input },
        },
      ],
    });
    return head.key;
  }

  await prepareProject(db, ctx, c.fields, c.group);
  const key = uuidv7();
  const resolve = resolver([...heads, { key, name: c.name, traits: c.traits }]);
  const input = entityTypeInput.parse({
    name: c.name,
    description: c.description,
    pluralName: c.plural,
    icon: c.icon,
    color: c.color,
    group: norm(c.group),
    parentTypeKey: (c.parent && matchCatalogue(heads).get(c.parent)?.key) || null,
    traits: c.traits,
    fields: c.fields.map((f) => toField(f, resolve)),
  });
  await commit(db, {
    ...ctx.scope,
    message: `Add entry type "${c.name}" from template`,
    author,
    changes: [
      { op: 'create', collection: 'entityTypes', key, data: { ...input, order: heads.length } },
      ...linkExistingTypes(heads, c, key),
    ],
  });
  return key;
}
