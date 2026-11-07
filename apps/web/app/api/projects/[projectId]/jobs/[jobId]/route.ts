import { ObjectId } from 'mongodb';
import { getJob, NotFound } from '@epic/core';
import type { JobDto } from '@epic/schemas/api';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/jobs/[jobId]'>,
) {
  return handle(async () => {
    const { projectId, jobId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    if (!ObjectId.isValid(jobId)) throw new NotFound('Job not found');
    const j = await getJob(getAppDb(), ctx, new ObjectId(jobId));
    const body: JobDto = {
      id: jobId,
      type: j.type,
      status: j.status,
      progress: j.progress,
      output: j.output,
      costMicros: j.costMicros,
      error: j.error,
    };
    return Response.json(body);
  });
}
