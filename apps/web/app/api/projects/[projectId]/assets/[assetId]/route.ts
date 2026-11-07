import { assetViewUrl } from '@epic/core';
import { handle, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb, getStorage } from '../../../../../../lib/server';

/**
 * Shows an image: checks access, then redirects to a short-lived signed storage URL, so pages can
 * use this stable path in <img> tags while the bucket stays private.
 */
export function GET(
  req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/assets/[assetId]'>,
) {
  return handle(async () => {
    const { projectId, assetId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const url = await assetViewUrl(getAppDb(), getStorage(), ctx, assetId);
    return new Response(null, {
      status: 302,
      // Shorter than the signed URL's hour, so a cached redirect never points at an expired link.
      headers: {
        location: new URL(url, req.url).toString(),
        'cache-control': 'private, max-age=1800',
      },
    });
  });
}
