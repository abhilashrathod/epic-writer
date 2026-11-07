import { worldSnapshot } from '@epic/core';
import type { WorldDto } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor, toEntityDto, toFactDto, toLinkDto } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** Entries, links and facts for the time-aware views; "as of" is resolved client-side. */
export function GET(_req: Request, { params }: RouteContext<'/api/projects/[projectId]/world'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const w = await worldSnapshot(getAppDb(), ctx);
    const body: WorldDto = {
      entities: w.entities.map(toEntityDto),
      links: w.links.map(toLinkDto),
      facts: w.facts.map(toFactDto),
    };
    return Response.json(body);
  });
}
