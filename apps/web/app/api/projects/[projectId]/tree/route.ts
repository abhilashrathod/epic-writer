import { getTree } from '@epic/core';
import type { TreeDto } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toDocumentDto, toWorkDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

export function GET(_req: Request, { params }: RouteContext<'/api/projects/[projectId]/tree'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const tree = await getTree(getAppDb(), ctx);
    const body: TreeDto = {
      works: tree.works.map(toWorkDto),
      documents: tree.documents.map(toDocumentDto),
    };
    return Response.json(body);
  });
}
