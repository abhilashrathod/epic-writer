import { deleteEntity, getEntity, updateEntity } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor, toEntityDto } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/entities/[key]'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const { entity } = await getEntity(
      getAppDb(),
      await projectFor(projectId, await requireUser()),
      key,
    );
    return Response.json(toEntityDto(entity));
  });
}

export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    await updateEntity(getAppDb(), ctx, key, await req.json().catch(() => null));
    return new Response(null, { status: 204 });
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    await deleteEntity(getAppDb(), await projectFor(projectId, await requireUser()), key);
    return new Response(null, { status: 204 });
  });
}
