import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { financeNotes } from "../../../../db/schema";
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
  const [note] = await db
    .update(financeNotes)
    .set({
      title: payload.title,
      content: payload.content,
      status: payload.status,
      relation: payload.relation,
      relationDetail: payload.relationDetail,
      updatedAt: new Date(),
    })
    .where(eq(financeNotes.id, id))
    .returning();

  if (!note) return json({ error: "Note not found" }, { status: 404 });
  return json({ note });
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
