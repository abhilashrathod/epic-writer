import type { Db } from 'mongodb';
import { readHeadByKey, readHeads, type CalendarDoc } from '@epic/db';
import { calendarSchema } from '@epic/schemas/api';
import { commit } from './commit';
import { Invalid, NotFound } from './errors';
import type { ProjectContext } from './works';

const author = (ctx: ProjectContext) => ({ kind: 'user' as const, userId: ctx.userId });

function parse(raw: unknown) {
  const r = calendarSchema.safeParse(raw);
  if (!r.success) throw new Invalid(r.error.issues[0]?.message ?? 'Invalid calendar');
  return r.data;
}

/** The project's calendars (PR-3), the default first, then by name. */
export async function listCalendars(db: Db, ctx: ProjectContext): Promise<CalendarDoc[]> {
  const all = await readHeads(db, 'calendars', ctx.scope);
  const isDefault = (c: CalendarDoc) => Number(c.key === ctx.project.defaultCalendarKey);
  return all.sort((a, b) => isDefault(b) - isDefault(a) || a.name.localeCompare(b.name));
}

export async function createCalendar(db: Db, ctx: ProjectContext, raw: unknown): Promise<string> {
  const data = parse(raw);
  const { keys } = await commit(db, {
    ...ctx.scope,
    message: `Add calendar "${data.name}"`,
    author: author(ctx),
    changes: [{ op: 'create', collection: 'calendars', data }],
  });
  return keys[0]!;
}

export async function updateCalendar(
  db: Db,
  ctx: ProjectContext,
  key: string,
  raw: unknown,
): Promise<void> {
  if (!(await readHeadByKey(db, 'calendars', ctx.scope, key)))
    throw new NotFound('Calendar not found');
  const data = parse(raw);
  await commit(db, {
    ...ctx.scope,
    message: `Edit calendar "${data.name}"`,
    author: author(ctx),
    changes: [{ op: 'update', collection: 'calendars', key, data }],
  });
}

/** Story dates are day numbers, not tied to a calendar, so deleting one loses no dates. */
export async function deleteCalendar(db: Db, ctx: ProjectContext, key: string): Promise<void> {
  const cal = await readHeadByKey(db, 'calendars', ctx.scope, key);
  if (!cal) throw new NotFound('Calendar not found');
  if (key === ctx.project.defaultCalendarKey)
    throw new Invalid('Make another calendar the default before deleting this one');
  await commit(db, {
    ...ctx.scope,
    message: `Delete calendar "${cal.name}"`,
    author: author(ctx),
    changes: [{ op: 'delete', collection: 'calendars', key }],
  });
}
