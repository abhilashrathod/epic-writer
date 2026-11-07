import { createEntityType, listEntityTypes } from '@epic/core';
import { readHeadByKey } from '@epic/db';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toEntityTypeDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/entity-types'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const [types, calendar] = await Promise.all([
      listEntityTypes(getAppDb(), ctx),
      readHeadByKey(getAppDb(), 'calendars', ctx.scope, ctx.project.defaultCalendarKey),
    ]);
    return Response.json({
      groups: ctx.project.typeGroups,
      types: types.map(toEntityTypeDto),
      units: ctx.project.units,
      calendar: calendar && {
        months: calendar.months,
        eras: calendar.eras,
        displayFormat: calendar.displayFormat,
      },
    });
  });
}

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    // core validates the body with entityTypeInput.
    const key = await createEntityType(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
