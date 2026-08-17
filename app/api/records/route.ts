import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../_lib/records";

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  const db = getDb();
  const rows = kind
    ? await db.select().from(records).where(eq(records.kind, kind)).orderBy(desc(records.date), desc(records.id))
    : await db.select().from(records).orderBy(desc(records.date), desc(records.id));

  return Response.json({ records: rows });
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

  const kind = String(payload.kind ?? "");
  const fallbackKasaName = fallbackKasaNameFor(kind);
  const cashAccount = String(payload.cashAccount ?? "") || fallbackKasaName;

  const db = getDb();
  const [record] = await db
    .insert(records)
    .values({
      kind,
      date: String(payload.date ?? ""),
      source: String(payload.source ?? ""),
      detail: String(payload.detail ?? ""),
      note: String(payload.note ?? ""),
      person: String(payload.person ?? ""),
      amount: Number(payload.amount ?? 0),
      currency: String(payload.currency ?? "USD"),
      project: String(payload.project ?? ""),
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      monthlyExpense: Boolean(payload.monthlyExpense),
      cashAccount,
      listName: String(payload.listName ?? ""),
    })
    .returning();

  const ensuredCash = await ensureFallbackKasa(fallbackKasaName);

  return Response.json({ record, ensuredCash }, { status: 201 });
}
