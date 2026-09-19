import { getDb } from "../../../../db";
import { requireSession } from "../../_lib/auth";
import { unreadCommentCount } from "../../_lib/comments";
import { json, withErrorHandling } from "../../_lib/http";

// Powers the badge next to "Yorumlar" in the sidebar (app/page.tsx polls
// this). No page-permission gate here on purpose: the count itself is a
// harmless number, and a user without the "comments" permission still needs
// to know it if the sidebar is ever configured to show it to them.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const count = await unreadCommentCount(session.user, db);
  return json({ count });
});
