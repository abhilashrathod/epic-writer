import { createStoryline, listStorylines } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/storylines'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json({ storylines: await listStorylines(getAppDb(), ctx) });
  });
}

export function POST(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/storylines'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    // core validates the body with storylineInput.
    const key = await createStoryline(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
