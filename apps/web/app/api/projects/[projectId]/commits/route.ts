import { listCommits } from '@epic/core';
import { commitsQuery } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** Commit history, newest first (BR-2). `?before=<seq>&limit=<n>` pages back. */
export function GET(req: Request, { params }: RouteContext<'/api/projects/[projectId]/commits'>) {
  return handle(async () => {
    const { projectId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const q = commitsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    return Response.json(await listCommits(getAppDb(), ctx, q));
  });
}
