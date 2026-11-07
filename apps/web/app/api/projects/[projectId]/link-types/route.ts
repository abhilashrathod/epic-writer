import { createLinkType, listLinkTypes } from '@epic/core';
import type { LinkTypeDto } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/link-types'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const linkTypes: LinkTypeDto[] = (await listLinkTypes(getAppDb(), ctx)).map((t) => ({
      key: t.key,
      label: t.label,
      inverseLabel: t.inverseLabel,
      kind: t.kind,
      symmetric: t.symmetric,
      fromTypeKeys: t.fromTypeKeys,
      toTypeKeys: t.toTypeKeys,
    }));
    return Response.json({ linkTypes });
  });
}

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const key = await createLinkType(getAppDb(), ctx, await req.json().catch(() => null));
    return Response.json({ key }, { status: 201 });
  });
}
