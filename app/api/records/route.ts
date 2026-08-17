import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../_lib/records";
import type { Kind } from "../_lib/types";
import { parseBody, recordInputSchema } from "../_lib/validate";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

export const GET = withErrorHandling(async (request: Request) => {
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
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, recordInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  if (!session.user.isAdmin && !session.user.permissions.includes(payload.kind as Kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const fallbackKasaName = fallbackKasaNameFor(payload.kind);
  const cashAccount = payload.cashAccount || fallbackKasaName;

  const db = getDb();
  const { record, ensuredCash } = await db.transaction(async (tx) => {
    const [insertedRecord] = await tx
      .insert(records)
      .values({
        kind: payload.kind,
        date: payload.date,
        source: payload.source,
        detail: payload.detail,
        note: payload.note,
        person: payload.person,
        amount: payload.amount,
        currency: payload.currency,
        project: payload.project,
        tags: payload.tags,
        monthlyExpense: payload.monthlyExpense,
        cashAccount,
        listName: payload.listName,
      })
      .returning();

    const createdCash = await ensureFallbackKasa(fallbackKasaName, tx);
    return { record: insertedRecord, ensuredCash: createdCash };
  });

  return json({ record, ensuredCash }, { status: 201 });
});
