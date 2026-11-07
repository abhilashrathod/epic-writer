import { users } from '@epic/db';
import { preferencesBody } from '@epic/schemas/api';
import { handle, parseBody, requireUser } from '../../../../lib/http';
import { getAppDb } from '../../../../lib/server';

export function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const prefs = await parseBody(req, preferencesBody);
    await users.updatePreferences(getAppDb(), user._id, prefs);
    return new Response(null, { status: 204 });
  });
}
