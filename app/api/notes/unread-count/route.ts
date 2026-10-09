import { getDb } from "../../../../db";
import { requireSession } from "../../_lib/auth";
import { unreadNoteCount } from "../../_lib/notes";
import { json, withErrorHandling } from "../../_lib/http";

// Powers the badge next to "Mali Özel Notlar" in the sidebar (app/page.tsx
// polls this) — same no-permission-gate reasoning as comments/unread-count.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const count = await unreadNoteCount(session.user.id, db);
  return json({ count });
});
