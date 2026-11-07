import { enqueueAiJob } from '@epic/core';
import { enqueueJobBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** Queues an AI job (extract, continuity, ask). AI only ever runs on request. */
export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/jobs'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const { type, input } = await parseBody(req, enqueueJobBody);
    const job = await enqueueAiJob(getAppDb(), ctx, type, {
      ...input,
      userId: ctx.userId.toHexString(),
    });
    return Response.json({ id: job._id.toHexString() }, { status: 201 });
  });
}
