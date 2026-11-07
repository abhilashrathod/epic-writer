import { createDocument } from '@epic/core';
import { createDocumentBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function POST(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents'>,
) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const key = await createDocument(getAppDb(), ctx, await parseBody(req, createDocumentBody));
    return Response.json({ key }, { status: 201 });
  });
}
