import { undoCommit } from '@epic/core';
import { commitSeqParam } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** Undoes a commit with a new commit (BR-2). 409 when a later commit changed the same rows. */
export function POST(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/commits/[seq]/undo'>,
) {
  return handle(async () => {
    const { projectId, seq } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await undoCommit(getAppDb(), ctx, commitSeqParam.parse(seq)));
  });
}
