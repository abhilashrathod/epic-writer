import { createWork } from '@epic/core';
import { createWorkBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/works'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const key = await createWork(getAppDb(), ctx, await parseBody(req, createWorkBody));
    return Response.json({ key }, { status: 201 });
  });
}
