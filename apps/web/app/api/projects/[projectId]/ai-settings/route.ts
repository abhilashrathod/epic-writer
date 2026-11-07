import { getAiSettings, updateAiSettings } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/ai-settings'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json(await getAiSettings(getAppDb(), ctx));
  });
}

export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    await updateAiSettings(getAppDb(), ctx, await req.json().catch(() => null));
    return new Response(null, { status: 204 });
  });
}
