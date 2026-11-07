import { episodeGuide } from '@epic/core';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** The work's episode or chapter guide as Markdown (WK-5). */
export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/works/[workKey]/guide'>,
) {
  return handle(async () => {
    const { projectId, workKey } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await episodeGuide(getAppDb(), ctx, workKey));
  });
}
