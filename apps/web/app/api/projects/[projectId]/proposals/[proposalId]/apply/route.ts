import { applyProposal } from '@epic/core';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** Commits the accepted changes as one commit (AI-4). */
export function POST(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/proposals/[proposalId]/apply'>,
) {
  return handle(async () => {
    const { projectId, proposalId } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    return Response.json(await applyProposal(getAppDb(), ctx, proposalId));
  });
}
