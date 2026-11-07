import { createEntity, listEntities } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toEntityDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/entities'>;

/** All entries; `?scrapped=1` includes scrapped ones (CX-12). */
export function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const includeScrapped = new URL(req.url).searchParams.get('scrapped') === '1';
    const entities = await listEntities(getAppDb(), ctx, { includeScrapped });
    return Response.json({ entities: entities.map(toEntityDto) });
  });
}

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    // core validates the body against entityInput and the entry's type.
    const key = await createEntity(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
