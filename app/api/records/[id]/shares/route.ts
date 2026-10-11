import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { listExpenseShares, listMembers, records } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildListDetails, loadListForUser } from "../../../_lib/lists";
import { expenseSharesInputSchema, parseBody } from "../../../_lib/validate";

// Bir liste giderinin kişilere paylaşımını (tamamını) değiştirir.
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
  if (!record || record.kind !== "expense" || record.listId == null) return json({ error: "Bu kayıt bir liste gideri değil" }, { status: 400 });
  const listId = record.listId;
  const { canWrite } = await loadListForUser(listId, session.user, db);
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, expenseSharesInputSchema);
  if ("response" in parsed) return parsed.response;
  const shares = parsed.data.shares.filter((s) => s.amount > 0);
  const total = Math.round(shares.reduce((a, s) => a + s.amount, 0) * 100) / 100;
  if (total > record.amount + 0.005) return json({ error: "Paylaşımların toplamı gider tutarını aşamaz" }, { status: 400 });
  if (new Set(shares.map((s) => s.memberId)).size !== shares.length) return json({ error: "Aynı kişi birden çok kez girilemez" }, { status: 400 });
  const members = await db.select({ id: listMembers.id }).from(listMembers).where(eq(listMembers.listId, listId));
  const allowed = new Set(members.map((m) => m.id));
  if (shares.some((s) => !allowed.has(s.memberId))) return json({ error: "Kişi bu listede yok" }, { status: 400 });

  await db.transaction(async (tx) => {
    await tx.delete(listExpenseShares).where(eq(listExpenseShares.recordId, id));
    if (shares.length) await tx.insert(listExpenseShares).values(shares.map((s) => ({ recordId: id, memberId: s.memberId, amount: s.amount })));
  });
  const [detail] = await buildListDetails([listId], session.user, db);
  return json({ list: detail });
});
