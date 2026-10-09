import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { commentThreadArchives, records } from "../../../../../../db/schema";
import { requireSession } from "../../../../_lib/auth";
import { canAccessRecord } from "../../../../_lib/records";
import { json, withErrorHandling } from "../../../../_lib/http";

// "Arşivle" on a Yorumlar thread — hides the whole thread from the main
// list (see GET /api/comments) and surfaces it under Arşiv > Yorumlar
// Arşivi (see GET /api/comments/archived) instead of deleting anything.
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

  await db
    .insert(commentThreadArchives)
    .values({ recordId: id, archivedByUserId: session.user.id, archivedByName: session.user.name })
    .onConflictDoNothing();
  return json({ ok: true });
});

// "Geri Al" — un-archives a thread, back into the main Yorumlar list.
export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
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

  await db.delete(commentThreadArchives).where(eq(commentThreadArchives.recordId, id));
  return json({ ok: true });
});
