import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json } from "../_lib/http";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../_lib/records";
import type { Kind } from "../_lib/types";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const allowed = allowedKinds(session.user);

  if (kind) {
    if (!allowed.includes(kind as Kind)) return json({ error: "Forbidden" }, { status: 403 });
    const db = getDb();
    const rows = await db.select().from(records).where(eq(records.kind, kind)).orderBy(desc(records.date), desc(records.id));
    return json({ records: rows });
  }

  if (!allowed.length) return json({ records: [] });
  const db = getDb();
  const rows = await db.select().from(records).where(inArray(records.kind, allowed)).orderBy(desc(records.date), desc(records.id));
  return json({ records: rows });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const kind = String(payload.kind ?? "");
  if (!session.user.isAdmin && !session.user.permissions.includes(kind as Kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
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

  return json({ record, ensuredCash }, { status: 201 });
}
