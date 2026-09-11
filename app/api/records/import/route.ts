import { getDb } from "../../../../db";
import { records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { ensureCashAccountLink, fallbackKasaNameFor } from "../../_lib/records";
import type { Kind } from "../../_lib/types";
import { parseBody, recordImportSchema } from "../../_lib/validate";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

export const POST = withErrorHandling(async (request: Request) => {
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

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // Resolve every distinct (kind, kasa name) pair once — cheaper than
    // re-resolving per row, and means a partially-forbidden import fails
    // atomically instead of inserting some rows and rejecting others.
    const linkCache = new Map<string, number | null>();
    for (const item of items) {
      const linkName = item.kind === "cash" ? item.source : (item.cashAccount || fallbackKasaNameFor(item.kind));
      const cacheKey = `${item.kind}:${linkName}`;
      if (linkCache.has(cacheKey)) continue;
      const link = await ensureCashAccountLink({ name: linkName, kind: item.kind, user: session.user }, tx);
      if (link.forbidden) return { forbidden: true as const };
      linkCache.set(cacheKey, link.cashAccountId);
    }

    const rowsToInsert = items.map((item) => {
      const fallbackKasaName = fallbackKasaNameFor(item.kind);
      const cashAccount = item.kind === "cash" ? item.source : (item.cashAccount || fallbackKasaName);
      const linkName = item.kind === "cash" ? item.source : cashAccount;
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
        cashAccount,
        cashAccountId: linkCache.get(`${item.kind}:${linkName}`) ?? null,
        listName: item.listName,
      };
    });

    const insertedRows = await tx.insert(records).values(rowsToInsert).returning();
    return { forbidden: false as const, insertedRows };
  });

  if (result.forbidden) return json({ error: "Forbidden" }, { status: 403 });
  return json({ records: result.insertedRows }, { status: 201 });
});
