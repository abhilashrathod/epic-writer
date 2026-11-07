import { exportDocumentText } from '@epic/core';
import { attachment } from '../../../../../../../lib/download';
import { handle, requireUser } from '../../../../../../../lib/http';
import { projectFor } from '../../../../../../../lib/project';
import { getAppDb } from '../../../../../../../lib/server';

/** The document as a .fountain or .md file, markers stripped (IO-3). */
export function GET(
  _req: Request,
  { params }: RouteContext<'/api/projects/[projectId]/documents/[key]/download'>,
) {
  return handle(async () => {
    const { projectId, key } = await params;
    const ctx = await projectFor(projectId, await requireUser());
    const { fileName, text } = await exportDocumentText(getAppDb(), ctx, key);
    return attachment(text, fileName, 'text/plain; charset=utf-8');
  });
}
