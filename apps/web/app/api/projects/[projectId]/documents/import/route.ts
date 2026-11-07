import { importFountain } from '@epic/core';
import { importFountainBody } from '@epic/schemas/io';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

/** Imports a Fountain file as a new script (IO-2). */
export function POST(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/import'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const key = await importFountain(getAppDb(), ctx, await parseBody(req, importFountainBody));
    return Response.json({ key }, { status: 201 });
  });
}
