import { getProposal, reviewProposal } from '@epic/core';
import { proposalPatch } from '@epic/schemas/proposals';
import { handle, parseBody, requireUser } from '../../../../../../lib/http';
import { projectFor } from '../../../../../../lib/project';
import { getAppDb } from '../../../../../../lib/server';

type Ctx = RouteContext<'/api/projects/[projectId]/proposals/[proposalId]'>;

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, proposalId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await getProposal(getAppDb(), ctx, proposalId));
  });
}

/** Accept, reject or edit changes (AI-4, AI-5). */
export function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { projectId, proposalId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const body = await parseBody(req, proposalPatch);
    return Response.json(await reviewProposal(getAppDb(), ctx, proposalId, body));
  });
}
