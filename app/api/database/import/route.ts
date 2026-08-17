import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { archive, financeNotes, preparedReports, records, settings } from "../../../../db/schema";
import { requireAdmin } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { databaseImportSchema, parseBody } from "../../_lib/validate";

const SETTINGS_ID = 1;

// Replaces all financial data (records/archive/notes/prepared reports)
// with the imported set, inside one transaction. Users/passwords/sessions
// are never touched. IDs from the export are dropped — the DB assigns
// fresh ones — since preserving them risks colliding with the serial
// sequence's next value.
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, databaseImportSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(records);
    await tx.delete(archive);
    await tx.delete(financeNotes);
    await tx.delete(preparedReports);

    if (payload.records.length) {
      await tx.insert(records).values(
        payload.records.map((r) => ({
          kind: r.kind,
          date: r.date,
          source: r.source,
          detail: r.detail,
          note: r.note,
          person: r.person,
          amount: r.amount,
          currency: r.currency,
          project: r.project,
          tags: r.tags,
          monthlyExpense: r.monthlyExpense,
          cashAccount: r.cashAccount,
          listName: r.listName,
        })),
      );
    }
    if (payload.archive.length) {
      await tx.insert(archive).values(
        payload.archive.map((a) => ({ action: a.action, userName: a.userName, oldRecord: a.oldRecord })),
      );
    }
    if (payload.notes.length) {
      await tx.insert(financeNotes).values(
        payload.notes.map((n) => ({
          title: n.title,
          content: n.content,
          status: n.status,
          relation: n.relation,
          relationDetail: n.relationDetail,
        })),
      );
    }
    if (payload.preparedReports.length) {
      await tx.insert(preparedReports).values(
        payload.preparedReports.map((r) => ({
          id: r.id?.trim() || crypto.randomUUID(),
          date: r.date,
          title: r.title,
          detail: r.detail,
          presentedTo: r.presentedTo,
          cashAccount: r.cashAccount,
          signature: r.signature,
          income: r.income,
          expense: r.expense,
        })),
      );
    }
    if (payload.settings) {
      const existing = await tx.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1);
      if (existing[0]) {
        await tx
          .update(settings)
          .set({
            company: payload.settings.company ?? existing[0].company,
            logo: payload.settings.logo ?? existing[0].logo,
            typography: payload.settings.typography ?? existing[0].typography,
            language: payload.settings.language ?? existing[0].language,
            updatedAt: new Date(),
          })
          .where(eq(settings.id, SETTINGS_ID));
      }
    }
  });

  return json({ ok: true });
});
