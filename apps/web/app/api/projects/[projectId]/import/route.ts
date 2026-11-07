import { importNotes, importStatus, Invalid } from '@epic/core';
import { importFileInput } from '@epic/schemas/import';
import { handle, requireUser } from '../../../../../lib/http';
import { parseNote } from '../../../../../lib/parse-note';
import { projectFor } from '../../../../../lib/project';
import { getAppDb } from '../../../../../lib/server';

/** IO-1: the imported notes with their extraction and review state. */
export function GET(_req: Request, { params }: RouteContext<'/api/projects/[projectId]/import'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    return Response.json(await importStatus(getAppDb(), ctx));
  });
}

/** IO-1: imports one note file (multipart field `file`) as note documents. */
export function POST(req: Request, { params }: RouteContext<'/api/projects/[projectId]/import'>) {
  return handle(async () => {
    const ctx = await projectFor((await params).projectId, await requireUser());
    const form = await req.formData().catch(() => {
      throw new Invalid('Send the file as a multipart form upload');
    });
    const file = importFileInput.parse(form.get('file'));
    const text = await parseNote(file.name, new Uint8Array(await file.arrayBuffer()));
    const result = await importNotes(getAppDb(), ctx, [{ name: file.name, text }]);
    return Response.json(result, { status: 201 });
  });
}
