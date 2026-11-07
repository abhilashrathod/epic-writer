import { listIssues } from '@epic/core';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** Open and stale continuity issues for one episode or chapter (AI-7). */
export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/continuity'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json({ issues: await listIssues(getAppDb(), ctx, key) });
  });
}
