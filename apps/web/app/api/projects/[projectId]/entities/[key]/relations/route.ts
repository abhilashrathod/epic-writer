import { entityRelations } from '@epic/core';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/entities/[key]/relations'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await entityRelations(getAppDb(), ctx, key));
  });
}
