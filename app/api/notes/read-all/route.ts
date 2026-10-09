import { getDb } from "../../../../db";
import { requirePermission } from "../../_lib/auth";
import { markAllNotesRead } from "../../_lib/notes";
import { json, withErrorHandling } from "../../_lib/http";

// Called when the Mali Özel Notlar page itself loads — viewing the board
// marks every (non-archived) note read for this user.
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const db = getDb();
  await markAllNotesRead(session.user.id, db);
  return json({ ok: true });
});
