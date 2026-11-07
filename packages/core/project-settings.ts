import type { Db } from 'mongodb';
import { projects, readHeadByKey, readHeads, type ProjectDoc } from '@epic/db';
import type { InspirationDto, OverviewDto, UnitDto, VisualInput } from '@epic/schemas/api';
import { requireImageAssets } from './assets';
import { Conflict, Invalid } from './errors';
import type { ProjectContext } from './works';

const set = (db: Db, ctx: ProjectContext, fields: Parameters<typeof projects.setFields>[2]) =>
  projects.setFields(db, ctx.project._id, fields);

/** PR-1. */
export async function renameProject(db: Db, ctx: ProjectContext, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new Invalid('Project name is empty');
  await set(db, ctx, { name: clean });
}

/** PR-1: archived projects leave the main list but keep every row; restoring brings them back. */
export async function setProjectArchived(
  db: Db,
  ctx: ProjectContext,
  archived: boolean,
): Promise<void> {
  await set(db, ctx, { archivedAt: archived ? (ctx.project.archivedAt ?? new Date()) : null });
}

/** PR-5. Themes are codex entries. */
export async function setOverview(db: Db, ctx: ProjectContext, overview: OverviewDto) {
  const themeKeys = [...new Set(overview.themeKeys)];
  if (themeKeys.length) {
    const found = await readHeads(db, 'entities', ctx.scope, { key: { $in: themeKeys } });
    if (found.length !== themeKeys.length) throw new Invalid('A theme points at a missing entry');
  }
  await set(db, ctx, { overview: { ...overview, themeKeys } });
}

/** PR-7: kept on the project, outside the codex graph. */
export async function setInspirations(db: Db, ctx: ProjectContext, list: InspirationDto[]) {
  await set(db, ctx, { inspirations: list });
}

/** Keys of units used by quantity fields of live entries or by facts. */
async function unitsInUse(db: Db, ctx: ProjectContext): Promise<Set<string>> {
  const used = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.unitKey === 'string' && typeof o.value === 'number') used.add(o.unitKey);
      Object.values(o).forEach(walk);
    }
  };
  const [entities, facts] = await Promise.all([
    readHeads(db, 'entities', ctx.scope),
    readHeads(db, 'facts', ctx.scope),
  ]);
  entities.forEach((e) => walk(e.fields));
  facts.forEach((f) => walk(f.value));
  return used;
}

/**
 * PR-4: units of distance, each sized against a shared base (`toBase`), so any two convert.
 * A unit still used by an entry or a recorded change can't be removed.
 */
export async function setUnits(db: Db, ctx: ProjectContext, units: UnitDto[]) {
  const keys = units.map((u) => u.key);
  if (new Set(keys).size !== keys.length) throw new Invalid('Two units share a key');
  const removed = ctx.project.units.filter((u) => !keys.includes(u.key));
  if (removed.length) {
    const used = await unitsInUse(db, ctx);
    const blocked = removed.filter((u) => used.has(u.key));
    if (blocked.length)
      throw new Conflict(
        `${blocked.map((u) => u.name).join(', ')} is still used in the codex. Change those values first.`,
      );
  }
  await set(db, ctx, { units });
}

/** Converts a quantity between two of the project's units. */
export function convertUnits(
  units: Pick<UnitDto, 'key' | 'toBase'>[],
  value: number,
  fromKey: string,
  toKey: string,
): number {
  const from = units.find((u) => u.key === fromKey);
  const to = units.find((u) => u.key === toKey);
  if (!from || !to) throw new Invalid('Unknown unit');
  return (value * from.toBase) / to.toBase;
}

/** PR-6: palette, mood keywords and mood-board images (uploaded assets of this project). */
export async function setVisual(db: Db, ctx: ProjectContext, visual: VisualInput) {
  const moodboardAssetIds = await requireImageAssets(db, ctx, visual.moodboardAssetIds);
  await set(db, ctx, {
    visual: { palette: visual.palette, moodKeywords: visual.moodKeywords, moodboardAssetIds },
  });
}

/** PR-3: which calendar formats dates across the app. */
export async function setDefaultCalendar(db: Db, ctx: ProjectContext, key: string) {
  if (!(await readHeadByKey(db, 'calendars', ctx.scope, key)))
    throw new Invalid('That calendar doesn’t exist');
  await set(db, ctx, { defaultCalendarKey: key });
}

export type ProjectSettings = Pick<
  ProjectDoc,
  'name' | 'overview' | 'visual' | 'inspirations' | 'units' | 'defaultCalendarKey'
> & { archived: boolean };

export function projectSettings(ctx: ProjectContext): ProjectSettings {
  const p = ctx.project;
  return {
    name: p.name,
    archived: !!p.archivedAt,
    overview: p.overview,
    visual: p.visual,
    inspirations: p.inspirations,
    units: p.units,
    defaultCalendarKey: p.defaultCalendarKey,
  };
}
