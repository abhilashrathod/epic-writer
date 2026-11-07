import { addFact, listFacts } from '@epic/core';
import type { FactDto } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toFactDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/facts'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    // core validates the body with factInput and the field's definition.
    const key = await addFact(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}

/** One entry's recorded changes, scrapped ones included (`?entity=<key>`), for editing. */
export function GET(req: Request, { params }: RouteContext<'/api/projects/[projectId]/facts'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const entity = new URL(req.url).searchParams.get('entity') ?? '';
    const facts: FactDto[] = (await listFacts(getAppDb(), ctx, entity)).map(toFactDto);
    return Response.json({ facts });
  });
}
