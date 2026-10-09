import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { financeNotes, users } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { noteInputSchema, parseBody } from "../../_lib/validate";

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

  // isArchived, kendi ayrı "Arşivle"/"Geri Al" eylemleriyle set edilir
  // (bkz. app/api/notes/[id]/archive) — burada gövdede gelmediyse eski
  // değeri korur, düzenleme akışında yanlışlıkla arşivden çıkmasın diye.
  const isArchived = payload.isArchived ?? old.isArchived;
  const [note] = await db
    .update(financeNotes)
    .set({
      title: payload.title,
      content: payload.content,
      status: payload.status,
      relation: payload.relation,
      relationDetail: payload.relationDetail,
      assignedUserIds: payload.assignedUserIds,
      isArchived,
      archivedAt: isArchived === old.isArchived ? old.archivedAt : isArchived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(financeNotes.id, id))
    .returning();

  const assignedIds = note.assignedUserIds as number[];
  let assignedUserNames: string[] = [];
  if (assignedIds.length) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assignedIds));
    const nameById = new Map(rows.map((u) => [u.id, u.name]));
    assignedUserNames = assignedIds.map((uid) => nameById.get(uid)).filter((name): name is string => Boolean(name));
  }

  return json({ note: { ...note, assignedUserNames, isUnread: false } });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  await db.delete(financeNotes).where(eq(financeNotes.id, id));
  return json({ ok: true });
});
