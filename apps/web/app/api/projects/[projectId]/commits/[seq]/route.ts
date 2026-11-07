import { getCommit } from '@epic/core';
import { commitSeqParam } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

/** One commit and what it changed (BR-2). */
export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/commits/[seq]'>,
) {
  return handle(async () => {
    const { projectId, seq } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await getCommit(getAppDb(), ctx, commitSeqParam.parse(seq)));
  });
}
