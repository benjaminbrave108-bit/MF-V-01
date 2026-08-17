import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { preparedReports } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody, preparedReportInputSchema } from "../_lib/validate";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt));
  return json({ preparedReports: rows });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, preparedReportInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;
  const id = payload.id?.trim() || crypto.randomUUID();

  const db = getDb();
  const [report] = await db
    .insert(preparedReports)
    .values({
      id,
      date: payload.date,
      title: payload.title,
      detail: payload.detail,
      presentedTo: payload.presentedTo,
      cashAccount: payload.cashAccount,
      signature: payload.signature,
      income: payload.income,
      expense: payload.expense,
    })
    .returning();

  return json({ preparedReport: report }, { status: 201 });
});
