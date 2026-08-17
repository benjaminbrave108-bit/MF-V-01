import { getDb } from "../../../../db";
import { records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../../_lib/records";
import type { Kind } from "../../_lib/types";

const MAX_IMPORT_ROWS = 2000;
const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: { items?: Record<string, unknown>[] };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return json({ records: [] });
  if (items.length > MAX_IMPORT_ROWS) {
    return json({ error: `En fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir` }, { status: 413 });
  }

  if (!session.user.isAdmin) {
    const kindsUsed = new Set(items.map((item) => String(item.kind ?? "")));
    for (const kind of kindsUsed) {
      if (!RECORD_KINDS.includes(kind as Kind) || !session.user.permissions.includes(kind as Kind)) {
        return json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const fallbackNamesUsed = new Set<string>();
  const rowsToInsert = items.map((item) => {
    const kind = String(item.kind ?? "");
    const fallbackKasaName = fallbackKasaNameFor(kind);
    const cashAccount = String(item.cashAccount ?? "") || fallbackKasaName;
    if (fallbackKasaName && cashAccount === fallbackKasaName) fallbackNamesUsed.add(fallbackKasaName);
    return {
      kind,
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
      cashAccount,
      listName: String(item.listName ?? ""),
    };
  });

  const db = getDb();
  const inserted = await db.insert(records).values(rowsToInsert).returning();

  for (const name of fallbackNamesUsed) {
    await ensureFallbackKasa(name);
  }

  return json({ records: inserted }, { status: 201 });
}
