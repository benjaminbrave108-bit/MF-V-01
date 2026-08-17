import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { financeNotes } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json } from "../../_lib/http";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const [note] = await db
    .update(financeNotes)
    .set({
      title: String(payload.title ?? ""),
      content: String(payload.content ?? ""),
      status: String(payload.status ?? "important"),
      relation: String(payload.relation ?? "none"),
      relationDetail: String(payload.relationDetail ?? ""),
      updatedAt: new Date(),
    })
    .where(eq(financeNotes.id, id))
    .returning();

  if (!note) return json({ error: "Note not found" }, { status: 404 });
  return json({ note });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  await db.delete(financeNotes).where(eq(financeNotes.id, id));
  return json({ ok: true });
}
