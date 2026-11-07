import { exportProjectJson, safeFileName } from '@epic/core';
import { attachment } from '../../../../../lib/download';
import { handle, requireUser } from '../../../../../lib/http';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** The whole project as one Extended JSON file (IO-7). */
export function GET(_req: Request, { params }: RouteContext<'/api/projects/[projectId]/backup'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const json = await exportProjectJson(getAppDb(), ctx);
    const date = new Date().toISOString().slice(0, 10);
    return attachment(
      json,
      `${safeFileName(ctx.project.name)} backup ${date}.json`,
      'application/json; charset=utf-8',
    );
  });
}
