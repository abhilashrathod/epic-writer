import { tagScene } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

/** Sets a scene's storylines and point of view; core validates with sceneTagsInput. */
export function PATCH(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/scenes/[sceneKey]'>,
) {
  return handle(async () => {
    const { projectId, sceneKey } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    await tagScene(getAppDb(), ctx, sceneKey, await req.json().catch(() => null));
    return new Response(null, { status: 204 });
  });
}
