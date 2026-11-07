import { addFact } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/facts'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    // core validates the body with factInput and the field's definition.
    const key = await addFact(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
