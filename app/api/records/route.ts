import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { accessibleCashAccountIds } from "../_lib/cash-access";
import { json, withErrorHandling } from "../_lib/http";
import { ensureCashAccountLink, fallbackKasaNameFor } from "../_lib/records";
import { markListKasa, resolveRecordList, setRjKasa, unmarkListKasa } from "../_lib/lists";
import { cashAccounts } from "../../../db/schema";
import type { Kind } from "../_lib/types";
import { parseBody, recordInputSchema } from "../_lib/validate";
import { formatAmount, logActivity } from "../_lib/activity";
import { kasaName, outstandingDebt, reduceLentExpenses, type DebtMeta } from "../_lib/debts";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

// Records with no kasa link at all (cashAccountId null — shouldn't happen
// post-migration, but a null-safety net) stay visible to anyone with the
// page permission; everything else is additionally filtered by kasa access.
function scopeToAccessibleKasas<T extends { cashAccountId: number | null }>(rows: T[], accessibleIds: number[] | null): T[] {
  if (accessibleIds === null) return rows;
  const allowed = new Set(accessibleIds);
  return rows.filter((row) => row.cashAccountId === null || allowed.has(row.cashAccountId));
}

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const allowed = allowedKinds(session.user);
  const db = getDb();
  const accessibleIds = await accessibleCashAccountIds(session.user, db);

  if (kind) {
    if (!allowed.includes(kind as Kind)) return json({ error: "Forbidden" }, { status: 403 });
    const rows = await db.select().from(records).where(eq(records.kind, kind)).orderBy(desc(records.date), desc(records.id));
    return json({ records: scopeToAccessibleKasas(rows, accessibleIds) });
  }

  if (!allowed.length) return json({ records: [] });
  const rows = await db.select().from(records).where(inArray(records.kind, allowed)).orderBy(desc(records.date), desc(records.id));
  return json({ records: scopeToAccessibleKasas(rows, accessibleIds) });
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

  // Hiçbir gelir/gider kasadan kopuk olamaz: kasa zorunludur (kasalar da bir çalışma alanına bağlıdır).
  if (payload.kind !== "cash" && !payload.cashAccount?.trim()) return json({ error: "Gelir/gider bir kasaya bağlı olmalıdır" }, { status: 400 });

  const db = getDb();
  const listLink = await resolveRecordList(session.user, { listId: payload.listId, listName: payload.listName }, db);
  if ("error" in listLink) return json({ error: listLink.error }, { status: 400 });
  const linkName = payload.kind === "cash" ? payload.source : payload.cashAccount;
  const result = await db.transaction(async (tx) => {
    const link = await ensureCashAccountLink({ name: linkName, kind: payload.kind, user: session.user }, tx);
    if (link.forbidden) return { forbidden: true as const };
    // "Liste Kasası" işaretli kasa kaydı: kasa Listeler sayfasında otomatik çalışma alanı olur.
    if (payload.kind === "cash" && payload.listKasa && link.cashAccountId != null) await markListKasa(link.cashAccountId, tx);
    if (payload.kind === "cash" && payload.listKasa === false && link.cashAccountId != null) await unmarkListKasa(link.cashAccountId, tx);
    if (payload.kind === "cash" && payload.rjKasa !== undefined && link.cashAccountId != null) await setRjKasa(link.cashAccountId, payload.rjKasa, tx);
    // Kasa kaydında seçilen "kasa bölümü" kasaya yazılır (boş = Genel Kasa).
    if (payload.kind === "cash" && payload.sectionId !== undefined && link.cashAccountId != null) await tx.update(cashAccounts).set({ sectionId: payload.sectionId }).where(eq(cashAccounts.id, link.cashAccountId));

    // Gider eklerken borç işareti: lent (borç veriyorum) ya da repay (borcumu ödüyorum).
    const debtMode = payload.kind === "expense" ? payload.debtMode : undefined;
    let debtOther: { id: number; name: string } | null = null;
    let debtMeta: DebtMeta = [];
    if (debtMode) {
      if (!payload.debtCashAccountId) return { badDebt: "Borç için karşı kasayı seçin" };
      if (link.cashAccountId == null || payload.debtCashAccountId === link.cashAccountId) return { badDebt: "Karşı kasa, giderin kasasından farklı olmalıdır" };
      const otherName = await kasaName(payload.debtCashAccountId, tx);
      if (!otherName) return { badDebt: "Karşı kasa bulunamadı" };
      debtOther = { id: payload.debtCashAccountId, name: otherName };
      if (payload.amount <= 0) return { badDebt: "Borç tutarı sıfırdan büyük olmalıdır" };
      if (debtMode === "repay") {
        const remaining = await outstandingDebt(link.cashAccountId, debtOther.id, payload.currency, tx);
        if (remaining <= 0) return { badDebt: `Bu kasanın ${debtOther.name} kasasına ${payload.currency} cinsinden borcu yok` };
        if (payload.amount > remaining + 0.001) return { badDebt: `Ödeme kalan borçtan büyük olamaz (kalan: ${remaining} ${payload.currency})` };
        debtMeta = await reduceLentExpenses(debtOther.id, link.cashAccountId, payload.currency, payload.amount, tx);
      }
    }

    const [insertedRecord] = await tx
      .insert(records)
      .values({
        debtRole: debtMode ?? "",
        debtCashAccountId: debtOther?.id ?? null,
        debtMeta,
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
        cashAccount: payload.kind === "cash" ? payload.source : (payload.cashAccount || fallbackKasaNameFor(payload.kind)),
        cashAccountId: link.cashAccountId,
        sectionId: payload.kind === "cash" ? null : payload.sectionId ?? null,
        listName: listLink.listName ?? "",
        listId: listLink.listId ?? null,
        attachments: payload.attachments,
        detailTable: payload.detailTable,
        detailTableLayout: payload.detailTableLayout,
      })
      .returning();

    // Borç verildiyse borç alan kasaya otomatik "Borç Alındı" girişi yazılır; iki kayıt birbirine bağlanır.
    let record = insertedRecord;
    if (debtMode === "lent" && debtOther && link.cashAccountId != null) {
      const [twin] = await tx
        .insert(records)
        .values({
          kind: "income",
          date: payload.date,
          source: "Borç Alındı",
          detail: `Borç alındı ← ${payload.cashAccount}`,
          note: payload.note,
          person: payload.cashAccount,
          amount: payload.amount,
          currency: payload.currency,
          cashAccount: debtOther.name,
          cashAccountId: debtOther.id,
          debtRole: "borrowed",
          debtCashAccountId: link.cashAccountId,
          debtLinkId: insertedRecord.id,
        })
        .returning();
      [record] = await tx.update(records).set({ debtLinkId: twin.id }).where(eq(records.id, insertedRecord.id)).returning();
    }

    return { forbidden: false as const, record, ensuredCash: link.ensuredCashRecord };
  });

  if ("badDebt" in result) return json({ error: result.badDebt }, { status: 400 });
  if (result.forbidden) return json({ error: "Forbidden" }, { status: 403 });
  const created = result.record;
  await logActivity(session.user, {
    category: created.kind,
    action: "create",
    summary: `${({ income: "Gelir", expense: "Gider", cash: "Kasa" } as Record<string, string>)[created.kind]} eklendi: ${created.source} — ${formatAmount(created.amount, created.currency)}`,
    kasa: created.kind === "cash" ? created.source : created.cashAccount,
    meta: { id: created.id },
  });
  return json({ record: result.record, ensuredCash: result.ensuredCash }, { status: 201 });
});
