import { getDb } from "../../../../db";
import { records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../../_lib/records";
import type { Kind } from "../../_lib/types";
import { parseBody, recordImportSchema } from "../../_lib/validate";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, recordImportSchema);
  if ("response" in parsed) return parsed.response;
  const items = parsed.data.items;

  if (!session.user.isAdmin) {
    const kindsUsed = new Set(items.map((item) => item.kind));
    for (const kind of kindsUsed) {
      if (!RECORD_KINDS.includes(kind as Kind) || !session.user.permissions.includes(kind as Kind)) {
        return json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const fallbackNamesUsed = new Set<string>();
  const rowsToInsert = items.map((item) => {
    const fallbackKasaName = fallbackKasaNameFor(item.kind);
    const cashAccount = item.cashAccount || fallbackKasaName;
    if (fallbackKasaName && cashAccount === fallbackKasaName) fallbackNamesUsed.add(fallbackKasaName);
    return {
      kind: item.kind,
      date: item.date || new Date().toISOString().slice(0, 10),
      source: item.source,
      detail: item.detail,
      note: item.note,
      person: item.person,
      amount: item.amount,
      currency: item.currency,
      project: item.project,
      tags: item.tags,
      monthlyExpense: item.monthlyExpense,
      cashAccount,
      listName: item.listName,
    };
  });

  const db = getDb();
  const inserted = await db.transaction(async (tx) => {
    const insertedRows = await tx.insert(records).values(rowsToInsert).returning();
    for (const name of fallbackNamesUsed) {
      await ensureFallbackKasa(name, tx);
    }
    return insertedRows;
  });

  return json({ records: inserted }, { status: 201 });
}
