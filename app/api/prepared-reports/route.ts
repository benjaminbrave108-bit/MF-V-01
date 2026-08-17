import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { preparedReports } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json } from "../_lib/http";

export async function GET(request: Request) {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt));
  return json({ preparedReports: rows });
}

export async function POST(request: Request) {
  const session = await requirePermission(request, "reportBuilder");
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const id = String(payload.id ?? "").trim() || crypto.randomUUID();

  const db = getDb();
  const [report] = await db
    .insert(preparedReports)
    .values({
      id,
      date: String(payload.date ?? ""),
      title: String(payload.title ?? ""),
      detail: String(payload.detail ?? ""),
      presentedTo: String(payload.presentedTo ?? ""),
      cashAccount: String(payload.cashAccount ?? ""),
      signature: String(payload.signature ?? ""),
      income: Array.isArray(payload.income) ? payload.income : [],
      expense: Array.isArray(payload.expense) ? payload.expense : [],
    })
    .returning();

  return json({ preparedReport: report }, { status: 201 });
}
