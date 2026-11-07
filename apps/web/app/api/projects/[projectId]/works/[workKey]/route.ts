import { setWorkLevels } from '@epic/core';
import { updateWorkBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

/** WK-2: edit a work's structure levels. */
export function PATCH(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/works/[workKey]'>,
) {
  return handle(async () => {
    const { projectId, workKey } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const { levels } = await parseBody(req, updateWorkBody);
    await setWorkLevels(getAppDb(), ctx, workKey, levels);
    return new Response(null, { status: 204 });
  });
}
