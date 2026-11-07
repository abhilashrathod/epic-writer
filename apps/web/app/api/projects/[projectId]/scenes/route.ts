import { listScenes } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** Scenes in narrative order with their episode; `?work=` limits them to one work. */
export function GET(req: Request, { params }: RouteContext<'/api/projects/[projectId]/scenes'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const work = new URL(req.url).searchParams.get('work') ?? undefined;
    return Response.json({ scenes: await listScenes(getAppDb(), ctx, work) });
  });
}
