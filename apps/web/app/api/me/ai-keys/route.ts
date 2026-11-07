import { aiKeySummaries, saveAiKey } from '@epic/core';
import { handle, requireUser } from '../../../../lib/http';
import { getAppDb, getEnv } from '../../../../lib/server';

/** Saved keys as label and last four characters only (AI-2). */
export function GET() {
  return handle(async () => Response.json({ keys: aiKeySummaries(await requireUser()) }));
}

export function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const keys = await saveAiKey(
      getAppDb(),
      user,
      await req.json().catch(() => null),
      getEnv().KEY_ENCRYPTION_SECRET,
    );
    return Response.json({ keys }, { status: 201 });
  });
}
