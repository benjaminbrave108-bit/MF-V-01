import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { preparedReports } from "../../../db/schema";
import { requireSession } from "../_lib/auth";

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt));
  return Response.json({ preparedReports: rows });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const id = String(payload.id ?? "").trim() || `${Date.now()}`;

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

  return Response.json({ preparedReport: report }, { status: 201 });
}
