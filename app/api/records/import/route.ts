import { getDb } from "../../../../db";
import { records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: { items?: Record<string, unknown>[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return Response.json({ records: [] });

  const db = getDb();
  const inserted = await db
    .insert(records)
    .values(
      items.map((item) => ({
        kind: String(item.kind ?? ""),
        date: String(item.date ?? ""),
        source: String(item.source ?? ""),
        detail: String(item.detail ?? ""),
        note: String(item.note ?? ""),
        person: String(item.person ?? ""),
        amount: Number(item.amount ?? 0),
        currency: String(item.currency ?? "USD"),
        project: String(item.project ?? ""),
        tags: Array.isArray(item.tags) ? item.tags : [],
        monthlyExpense: Boolean(item.monthlyExpense),
        cashAccount: String(item.cashAccount ?? ""),
        listName: String(item.listName ?? ""),
      })),
    )
    .returning();

  return Response.json({ records: inserted }, { status: 201 });
}
