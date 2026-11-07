import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cashAccounts, kasaSections, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { parseBody, sectionUpdateSchema } from "../../_lib/validate";
import { deleteReason, logActivity, withReason } from "../../_lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin) return json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });
  const parsed = await parseBody(request, sectionUpdateSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const [row] = await getDb().update(kasaSections).set(parsed.data).where(eq(kasaSections.id, id)).returning();
    if (!row) return json({ error: "Not found" }, { status: 404 });
    await logActivity(session.user, { category: "workspace", action: "update", summary: `Çalışma alanı düzenlendi: ${row.name}`, workspace: row.name });
    return json({ section: { id: row.id, scope: row.scope, name: row.name, color: row.color } });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e?.cause?.code ?? e?.code) === "23505") return json({ error: "Bu adla bir bölüm zaten var" }, { status: 409 });
    throw error;
  }
});

// Bölümü siler: kasa/kayıtlar silinmez, yalnızca bölümden ayrılır (Genel Kasa / bölümsüz olur).
export const DELETE = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin) return json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });
  const db = getDb();
  const [gone] = await db.select().from(kasaSections).where(eq(kasaSections.id, id)).limit(1);
  await db.transaction(async (tx) => {
    await tx.update(cashAccounts).set({ sectionId: null }).where(eq(cashAccounts.sectionId, id));
    await tx.update(records).set({ sectionId: null }).where(eq(records.sectionId, id));
    await tx.delete(kasaSections).where(eq(kasaSections.id, id));
  });
  await logActivity(session.user, { category: "workspace", action: "delete", summary: withReason(`Çalışma alanı silindi: ${gone?.name ?? id}`, deleteReason(request)), workspace: gone?.name ?? "" });
  return json({ ok: true });
});
