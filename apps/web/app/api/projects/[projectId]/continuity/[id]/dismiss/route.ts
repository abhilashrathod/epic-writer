import { dismissIssue } from '@epic/core';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** Dismisses a continuity issue; it stays dismissed if a later check flags the same text. */
export function POST(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/continuity/[id]/dismiss'>,
) {
  return handle(async () => {
    const { projectId, id } = await params;
    await dismissIssue(getAppDb(), await projectFor(projectId, await requireUser()), id);
    return new Response(null, { status: 204 });
  });
}
