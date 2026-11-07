import { createSnapshot, listVersions } from '@epic/core';
import { createSnapshotBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../../../lib/http';
import { projectFor, toVersionDto } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/documents/[key]/versions'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json({
      versions: (await listVersions(getAppDb(), ctx, key)).map(toVersionDto),
    });
  });
}

export function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const body = await parseBody(req, createSnapshotBody);
    const v = await createSnapshot(getAppDb(), ctx, {
      documentKey: key,
      reason: 'manual',
      ...body,
    });
    return Response.json({ version: toVersionDto(v) }, { status: 201 });
  });
}
