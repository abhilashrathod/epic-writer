import { deleteFact } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

export function DELETE(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/facts/[key]'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    await deleteFact(getAppDb(), await projectFor(projectId, await requireUser()), key);
    return new Response(null, { status: 204 });
  });
}
