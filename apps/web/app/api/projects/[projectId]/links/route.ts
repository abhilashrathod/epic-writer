import { createLink } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/links'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const key = await createLink(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
