import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { records } from "../../../../../../db/schema";
import { requireSession } from "../../../../_lib/auth";
import { canAccessRecord } from "../../../../_lib/records";
import { markCommentRead } from "../../../../_lib/comments";
import { json, withErrorHandling } from "../../../../_lib/http";

// Called whenever this record's thread is opened (RecordCommentsModal) —
// marks it read for the current user so the "Yorumlar" sidebar badge drops
// by however many unread comments were in it.
export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const rows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const record = rows[0];
  if (!record) return json({ error: "Record not found" }, { status: 404 });
  if (!(await canAccessRecord(session.user, record, db))) return json({ error: "Forbidden" }, { status: 403 });

  await markCommentRead(session.user.id, id, db);
  return json({ ok: true });
});
