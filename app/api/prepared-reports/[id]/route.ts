import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { preparedReports } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { json } from "../../_lib/http";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const { id } = await params;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const [report] = await db
    .update(preparedReports)
    .set({
      date: String(payload.date ?? ""),
      title: String(payload.title ?? ""),
      detail: String(payload.detail ?? ""),
      presentedTo: String(payload.presentedTo ?? ""),
      cashAccount: String(payload.cashAccount ?? ""),
      signature: String(payload.signature ?? ""),
      income: Array.isArray(payload.income) ? payload.income : [],
      expense: Array.isArray(payload.expense) ? payload.expense : [],
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
