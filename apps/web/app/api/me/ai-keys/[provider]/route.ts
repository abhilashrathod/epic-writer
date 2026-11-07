import { deleteAiKey } from '@epic/core';
import { handle, requireUser } from '../../../../../lib/http';
import { getAppDb } from '../../../../../lib/server';

export function DELETE(_req: Request, { params }: RouteContext<'/api/me/ai-keys/[provider]'>) {
  return handle(async () => {
    await deleteAiKey(getAppDb(), await requireUser(), (await params).provider);
    return new Response(null, { status: 204 });
  });
}
