import { restoreVersion } from '@epic/core';
import { restoreBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../../../../lib/http';
import { projectFor } from '../../../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../../../lib/server';

export function POST(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/versions/[id]/restore'>,
) {
  return handle(async () => {
    const { projectId, key, id } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const { baseVersion } = await parseBody(req, restoreBody);
    return Response.json(
      await restoreVersion(getAppDb(), ctx, { documentKey: key, versionId: id, baseVersion }),
    );
  });
}
