import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { lists, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { buildWorkspaces, loadListForUser, syncListExpense, writeAllocations } from "../../_lib/lists";
import { listUpdateSchema, parseBody } from "../../_lib/validate";

type Ctx = { params: Promise<{ id: string }> };

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
}

export const PUT = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, listUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const touchesMoney = payload.amount !== undefined || payload.allocations !== undefined;
  if (touchesMoney && list.status === "closed" && payload.status !== "open") {
    return json({ error: "Liste kapalı; tutar ve dağılım değiştirilemez. Önce listeyi yeniden açın." }, { status: 409 });
  }
  const newAmount = payload.amount ?? list.amount;
  let allocationError: string | null = null;
  try {
    await db.transaction(async (tx) => {
      const name = payload.name ?? list.name;
      await tx
        .update(lists)
        .set({
          code: payload.code ?? list.code,
          name,
          date: payload.date ?? list.date,
          status: payload.status ?? list.status,
          amount: newAmount,
          note: payload.note ?? list.note,
          updatedAt: new Date(),
        })
        .where(eq(lists.id, id));
      if (payload.allocations) {
        allocationError = await writeAllocations(tx, list, newAmount, payload.allocations);
        if (allocationError) tx.rollback();
      }
      // Liste adı değiştiyse eski "Liste Kaydı" alanındaki ad kopyası da güncellenir.
      if (name !== list.name) await tx.update(records).set({ listName: name }).where(eq(records.listId, id));
      await syncListExpense(tx, id);
    });
  } catch (error) {
    if (allocationError) return json({ error: allocationError }, { status: 400 });
    if (isUniqueViolation(error)) return json({ error: "Bu çalışma alanında aynı kodlu bir liste zaten var" }, { status: 409 });
    throw error;
  }
  const [workspace] = await buildWorkspaces(session.user, [list.cashAccountId!], db);
  return json({ workspace });
});

// Listeyi ve ürünlerini siler; bağlı eski gelir/gider kayıtları silinmez.
export const DELETE = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  await db.transaction(async (tx) => {
    // Listenin otomatik gider kaydı da silinir; diğer eski kayıtlar listeden ayrılır.
    if (list.expenseRecordId != null) await tx.delete(records).where(eq(records.id, list.expenseRecordId));
    await tx.update(records).set({ listName: "" }).where(eq(records.listId, id));
    await tx.delete(lists).where(eq(lists.id, id));
  });
  const [workspace] = await buildWorkspaces(session.user, [list.cashAccountId!], db);
  return json({ workspace: workspace ?? null });
});
