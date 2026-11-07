import { deleteFact, setFactCanonState } from '@epic/core';
import { factCanonBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

export function DELETE(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/facts/[key]'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    await deleteFact(getAppDb(), await projectFor(projectId, await requireUser()), key);
    return new Response(null, { status: 204 });
  });
}

/** CX-12: canon, tentative or scrapped. */
export function PATCH(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/facts/[key]'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const { canonState } = await parseBody(req, factCanonBody);
    await setFactCanonState(getAppDb(), ctx, key, canonState);
    return new Response(null, { status: 204 });
  });
}
