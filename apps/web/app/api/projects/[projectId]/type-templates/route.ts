import { applyTypeTemplate, listTypeTemplates } from '@epic/core';
import { applyTypeTemplateInput } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/type-templates'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json({ templates: await listTypeTemplates(getAppDb(), ctx) });
  });
}

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const { id } = applyTypeTemplateInput.parse(await req.json().catch(() => null));
    return Response.json({ key: await applyTypeTemplate(getAppDb(), ctx, id) }, { status: 201 });
  });
}
