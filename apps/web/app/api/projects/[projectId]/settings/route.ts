import {
  listCalendars,
  projectSettings,
  renameProject,
  setDefaultCalendar,
  setInspirations,
  setOverview,
  setProjectArchived,
  setUnits,
  setVisual,
} from '@epic/core';
import { updateProjectBody, type ProjectSettingsDto } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/settings'>;

/** Project settings (PR-1, PR-3 to PR-7). */
export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const s = projectSettings(ctx);
    const calendars = await listCalendars(getAppDb(), ctx);
    const body: ProjectSettingsDto = {
      ...s,
      visual: {
        palette: s.visual.palette,
        moodKeywords: s.visual.moodKeywords,
        moodboard: s.visual.moodboardAssetIds.map((id) => ({
          id: id.toHexString(),
          url: `/api/projects/${projectId}/assets/${id.toHexString()}`,
        })),
      },
      calendars: calendars.map((c) => ({
        key: c.key,
        name: c.name,
        epochOffset: c.epochOffset,
        months: c.months,
        daysPerWeek: c.daysPerWeek,
        weekdayNames: c.weekdayNames,
        eras: c.eras,
        displayFormat: c.displayFormat,
      })),
    };
    return Response.json(body);
  });
}

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const body = await parseBody(req, updateProjectBody);
    const db = getAppDb();
    if ('name' in body) await renameProject(db, ctx, body.name);
    else if ('archived' in body) await setProjectArchived(db, ctx, body.archived);
    else if ('overview' in body) await setOverview(db, ctx, body.overview);
    else if ('inspirations' in body) await setInspirations(db, ctx, body.inspirations);
    else if ('units' in body) await setUnits(db, ctx, body.units);
    else if ('visual' in body) await setVisual(db, ctx, body.visual);
    else await setDefaultCalendar(db, ctx, body.defaultCalendarKey);
    return new Response(null, { status: 204 });
  });
}
