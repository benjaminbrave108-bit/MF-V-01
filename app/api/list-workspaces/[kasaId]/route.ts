import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { listWorkspaces, lists } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../../_lib/lists";
import { parseBody, workspaceUpdateSchema } from "../../_lib/validate";

type Ctx = { params: Promise<{ kasaId: string }> };

// Çalışma alanının adını, elle tutarını (null = kasadan otomatik) ve notunu günceller.
export const PUT = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const kasaId = Number((await params).kasaId);
  if (!Number.isFinite(kasaId)) return json({ error: "Invalid id" }, { status: 400 });
  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, workspaceUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const set: Partial<typeof listWorkspaces.$inferInsert> = { updatedAt: new Date() };
  if (payload.name !== undefined) set.name = payload.name.trim();
  if (payload.amount !== undefined) set.amount = payload.amount;
  if (payload.note !== undefined) set.note = payload.note.trim();
  const updated = await db.update(listWorkspaces).set(set).where(eq(listWorkspaces.cashAccountId, kasaId)).returning();
  if (!updated.length) return json({ error: "Çalışma alanı bulunamadı" }, { status: 404 });
  const [workspace] = await buildWorkspaces(session.user, [kasaId], db);
  return json({ workspace });
});

// Yalnızca içinde liste olmayan çalışma alanı silinebilir (alıcıları da gider).
export const DELETE = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const kasaId = Number((await params).kasaId);
  if (!Number.isFinite(kasaId)) return json({ error: "Invalid id" }, { status: 400 });
  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  const existing = await db.select({ id: lists.id }).from(lists).where(eq(lists.cashAccountId, kasaId)).limit(1);
  if (existing.length) return json({ error: "Önce çalışma alanındaki listeleri silin" }, { status: 409 });
  await db.delete(listWorkspaces).where(eq(listWorkspaces.cashAccountId, kasaId));
  return json({ ok: true });
});
