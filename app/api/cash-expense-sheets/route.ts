import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { cashAccounts, cashExpenseSheets } from "../../../db/schema";
import { requirePermission, requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody, cashExpenseSheetInputSchema } from "../_lib/validate";

// Not currently called by the client (Gelir/Gider Çizelgesi rows arrive via
// /api/bootstrap already scoped to what the user may see) — kept for API
// completeness. Session-gated only; each row's own kind isn't checked here
// since listing everything the caller is signed in to see is exactly what a
// generic GET should do, same spirit as GET /api/prepared-reports.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(cashExpenseSheets).orderBy(desc(cashExpenseSheets.createdAt));
  const allowed = session.user.isAdmin
    ? rows
    : rows.filter((row) => session.user.permissions.includes(row.kind as "income" | "expense"));
  return json({ cashExpenseSheets: allowed });
});

export const POST = withErrorHandling(async (request: Request) => {
  const parsed = await parseBody(request, cashExpenseSheetInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  // Gelir Çizelgesi satırı "income" izni, Gider Çizelgesi "expense" izni
  // gerektirir — hangisi payload.kind'a bağlı, o yüzden izin kontrolü gövde
  // ayrıştırıldıktan sonra yapılıyor.
  const session = await requirePermission(request, payload.kind);
  if ("response" in session) return session.response;

  const db = getDb();
  const [account] = payload.cashAccountName
    ? await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.name, payload.cashAccountName)).limit(1)
    : [];

  const existingCount = await db.select({ id: cashExpenseSheets.id }).from(cashExpenseSheets).where(eq(cashExpenseSheets.kind, payload.kind));
  const year = new Date().getFullYear().toString().slice(2);
  const code = `${year}-${String(existingCount.length + 1).padStart(2, "0")}`;

  const [row] = await db
    .insert(cashExpenseSheets)
    .values({
      kind: payload.kind,
      code,
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
    })
    .returning();

  return json({ cashExpenseSheet: row }, { status: 201 });
});
