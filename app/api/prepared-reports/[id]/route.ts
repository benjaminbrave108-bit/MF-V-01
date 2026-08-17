import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { preparedReports } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { parseBody, preparedReportInputSchema } from "../../_lib/validate";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const { id } = await params;

  const parsed = await parseBody(request, preparedReportInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const [report] = await db
    .update(preparedReports)
    .set({
      date: payload.date,
      title: payload.title,
      detail: payload.detail,
      presentedTo: payload.presentedTo,
      cashAccount: payload.cashAccount,
      signature: payload.signature,
      income: payload.income,
      expense: payload.expense,
    })
    .where(eq(preparedReports.id, id))
    .returning();

  if (!report) return json({ error: "Report not found" }, { status: 404 });
  return json({ preparedReport: report });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const { id } = await params;
  const db = getDb();
  await db.delete(preparedReports).where(eq(preparedReports.id, id));
  return json({ ok: true });
}
