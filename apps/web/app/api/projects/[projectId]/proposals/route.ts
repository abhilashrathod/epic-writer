import { listProposals } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** A document's extraction proposals, newest first: `?document=<key>`. */
export function GET(req: Request, { params }: RouteContext<'/api/projects/[projectId]/proposals'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const documentKey = new URL(req.url).searchParams.get('document') ?? '';
    return Response.json({ proposals: await listProposals(getAppDb(), ctx, documentKey) });
  });
}
