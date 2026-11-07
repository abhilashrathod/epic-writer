import { createEntityType, listEntityTypes } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toEntityTypeDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/entity-types'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const types = await listEntityTypes(getAppDb(), ctx);
    return Response.json({ groups: ctx.project.typeGroups, types: types.map(toEntityTypeDto) });
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
