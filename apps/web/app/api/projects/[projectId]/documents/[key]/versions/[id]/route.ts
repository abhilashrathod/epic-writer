import { getVersion } from '@epic/core';
import { handle, requireUser } from '../../../../../../../../lib/http';
import { projectFor } from '../../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../../lib/server';

export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/versions/[id]'>,
) {
  return handle(async () => {
    const { projectId, key, id } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const v = await getVersion(getAppDb(), ctx, key, id);
    return Response.json({ ...v, createdAt: v.createdAt.toISOString() });
  });
}
