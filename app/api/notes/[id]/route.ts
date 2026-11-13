import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { financeNotes } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { dedupePeople, listClientNotes, resolveNoteStatus } from "../../_lib/notes";
import { noteInputSchema, parseBody } from "../../_lib/validate";
import { deleteReason, logActivity, withReason } from "../../_lib/activity";

export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, noteInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const existingRows = await db.select().from(financeNotes).where(eq(financeNotes.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return json({ error: "Note not found" }, { status: 404 });

  // isArchived kendi "Arşivle"/"Geri Al" eylemleriyle set edilir; gövdede yoksa eski değer korunur.
  const isArchived = payload.isArchived ?? old.isArchived;

  // Belgeler: işaretlenen mevcutlar çıkar, yeniler eklenir (en fazla 5).
  const current = (old.attachments as { name: string; data: string }[]) ?? [];
  const removed = new Set(payload.removeAttachmentIndexes);
  const attachments = [...current.filter((_, i) => !removed.has(i)), ...payload.addAttachments];
  if (attachments.length > 5) return json({ error: "En fazla 5 dosya eklenebilir" }, { status: 400 });

  await db
    .update(financeNotes)
    .set({
      title: payload.title,
      content: payload.content,
      status: await resolveNoteStatus(payload.status, db),
      relation: payload.relation,
      relationDetail: payload.relationDetail,
      assignedUserIds: payload.assignedUserIds,
      people: dedupePeople(payload.people),
      attachments,
      isArchived,
      archivedAt: isArchived === old.isArchived ? old.archivedAt : isArchived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(financeNotes.id, id));

  const note = (await listClientNotes(session.user.id, db)).find((n) => n.id === id);
  return json({ note: note ? { ...note, isUnread: false } : null });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  await db.delete(financeNotes).where(eq(financeNotes.id, id));
  await logActivity(session.user, { category: "note", action: "delete", summary: withReason("Not silindi", deleteReason(request)) });
  return json({ ok: true });
});
