import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { cashAccounts, cashExpenseSheets } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { parseBody, cashExpenseSheetInputSchema } from "../../_lib/validate";

// A row's own `kind` (set once at creation, never changed by PUT) decides
// which page permission ("income" or "expense") is required to touch it —
// fetch it first so PUT/DELETE gate on the right one.
async function requireSheetRowKind(rowId: number) {
  const db = getDb();
  const rows = await db.select({ kind: cashExpenseSheets.kind }).from(cashExpenseSheets).where(eq(cashExpenseSheets.id, rowId)).limit(1);
  return { db, kind: rows[0]?.kind as "income" | "expense" | undefined };
}

export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isInteger(rowId)) return json({ error: "Invalid id" }, { status: 400 });

  const { db, kind } = await requireSheetRowKind(rowId);
  if (!kind) return json({ error: "Row not found" }, { status: 404 });
  const session = await requirePermission(request, kind);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, cashExpenseSheetInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const [account] = payload.cashAccountName
    ? await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.name, payload.cashAccountName)).limit(1)
    : [];

  const [row] = await db
    .update(cashExpenseSheets)
    .set({
      cashAccountId: account?.id ?? null,
      cashAccountName: payload.cashAccountName,
      startDate: payload.startDate,
      endDate: payload.endDate,
      budget: payload.budget,
      reportReady: payload.reportReady,
      reportDelivered: payload.reportDelivered,
      reportDate: payload.reportDate,
      responsible: payload.responsible,
      note: payload.note,
      resultNote: payload.resultNote,
      updatedAt: new Date(),
    })
    .where(eq(cashExpenseSheets.id, rowId))
    .returning();

  if (!row) return json({ error: "Row not found" }, { status: 404 });
  return json({ cashExpenseSheet: row });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id } = await params;
  const rowId = Number(id);
  if (!Number.isInteger(rowId)) return json({ error: "Invalid id" }, { status: 400 });

  const { db, kind } = await requireSheetRowKind(rowId);
  if (!kind) return json({ ok: true });
  const session = await requirePermission(request, kind);
  if ("response" in session) return session.response;

  await db.delete(cashExpenseSheets).where(eq(cashExpenseSheets.id, rowId));
  return json({ ok: true });
});
