import { deleteEntityType, updateEntityType } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/entity-types/[key]'>;

export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    await updateEntityType(getAppDb(), ctx, key, await req.json().catch(() => null));
    return new Response(null, { status: 204 });
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    await deleteEntityType(getAppDb(), await projectFor(projectId, await requireUser()), key);
    return new Response(null, { status: 204 });
  });
}
