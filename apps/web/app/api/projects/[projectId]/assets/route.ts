import { finishImageUpload } from '@epic/core';
import { finishUploadBody, type UploadedImageDto } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb, getStorage } from '../../../../../lib/server';

/** Step 2 of an image upload: records the uploaded file as an asset. */
export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/assets'>) {
  return handle(async () => {
    const { projectId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const body = await parseBody(req, finishUploadBody);
    const asset = await finishImageUpload(getAppDb(), getStorage(), ctx, body);
    const id = asset._id.toHexString();
    const out: UploadedImageDto = { id, url: `/api/projects/${projectId}/assets/${id}` };
    return Response.json(out, { status: 201 });
  });
}
