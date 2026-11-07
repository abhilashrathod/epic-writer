import { deleteDocument, moveDocument, renameDocument, setDocumentStoryTime } from '@epic/core';
import { updateDocumentBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/documents/[key]'>;

export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const body = await parseBody(req, updateDocumentBody);
    if ('title' in body) await renameDocument(getAppDb(), ctx, key, body.title);
    else if ('move' in body) await moveDocument(getAppDb(), ctx, key, body.move);
    else await setDocumentStoryTime(getAppDb(), ctx, key, body.storyTime);
    return new Response(null, { status: 204 });
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    await deleteDocument(getAppDb(), await projectFor(projectId, await requireUser()), key);
    return new Response(null, { status: 204 });
  });
}
