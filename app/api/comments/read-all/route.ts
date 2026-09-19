import { getDb } from "../../../../db";
import { requirePermission } from "../../_lib/auth";
import { markAllCommentsRead } from "../../_lib/comments";
import { json, withErrorHandling } from "../../_lib/http";

// Called when the Yorumlar page itself loads — viewing the list marks every
// thread shown on it as read for this user (see markAllCommentsRead).
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "comments");
  if ("response" in session) return session.response;

  const db = getDb();
  await markAllCommentsRead(session.user, db);
  return json({ ok: true });
});
