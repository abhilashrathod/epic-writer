import { mergeEntities } from '@epic/core';
import { mergeBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

export function POST(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/entities/merge'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json(await mergeEntities(getAppDb(), ctx, await parseBody(req, mergeBody)));
  });
}
