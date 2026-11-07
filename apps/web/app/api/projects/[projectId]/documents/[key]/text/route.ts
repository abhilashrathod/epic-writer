import { getWorkingText, saveWorkingText } from '@epic/core';
import { saveTextBody, type DocumentTextDto } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../../lib/http';
import { projectFor, toDocumentDto } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/text'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const { document, text, version } = await getWorkingText(getAppDb(), ctx, key);
    const body: DocumentTextDto = { document: toDocumentDto(document), text, version };
    return Response.json(body);
  });
}

/** Optimistic save: 409 with `current` when the base version is stale. */
export function PUT(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/text'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const body = await parseBody(req, saveTextBody);
    return Response.json(await saveWorkingText(getAppDb(), ctx, { documentKey: key, ...body }));
  });
}
