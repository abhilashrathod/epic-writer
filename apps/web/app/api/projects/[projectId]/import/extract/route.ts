import { extractImportedNotes } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

/** IO-1: queues extraction for every imported note not yet extracted. Runs only on request. */
export function POST(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/import/extract'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json(await extractImportedNotes(getAppDb(), ctx), { status: 201 });
  });
}
