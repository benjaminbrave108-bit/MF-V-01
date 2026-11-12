import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { archive, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { canWriteCashAccount } from "../../_lib/cash-access";
import { ensureCashAccountLink } from "../../_lib/records";
import { markListKasa, resolveRecordList, setRjKasa, unmarkListKasa } from "../../_lib/lists";
import { cashAccounts } from "../../../../db/schema";
import type { Kind } from "../../_lib/types";
import { toClientArchiveItem } from "../../_lib/archive";
import { parseBody, recordUpdateSchema } from "../../_lib/validate";
import { deleteReason, formatAmount, logActivity, withReason } from "../../_lib/activity";
import { restoreLentExpenses, type DebtMeta } from "../../_lib/debts";
import { and, eq as eqOp, ne } from "drizzle-orm";

function canAccessKind(user: { isAdmin: boolean; permissions: string[] }, kind: string): boolean {
  return user.isAdmin || user.permissions.includes(kind as Kind);
}

export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, recordUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return json({ error: "Record not found" }, { status: 404 });

  // Optimistic locking: if the client tells us the updatedAt it started
  // editing from and it no longer matches, someone else saved a change in
  // the meantime — reject rather than silently overwrite their edit.
  if (payload.updatedAt && new Date(payload.updatedAt).getTime() !== old.updatedAt.getTime()) {
    return json({ error: "Bu kayıt başka bir kullanıcı tarafından değiştirildi" }, { status: 409 });
  }

  const kind = payload.kind ?? old.kind;
  // Both the record's current kind and its requested new kind must be
  // permitted — otherwise a user could smuggle a record from an
  // unauthorized bucket into an authorized one (or vice versa).
  if (!canAccessKind(session.user, old.kind) || !canAccessKind(session.user, kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  // Kind-level permission alone isn't enough: the record's *current* kasa
  // (if it has one) must also be one this user owns — sharing only grants
  // read access, not the right to edit/move a record by id.
  if (old.cashAccountId !== null && !(await canWriteCashAccount(session.user, old.cashAccountId, db))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  // Borç kayıtlarının tutarı, kasası ve para birimi sabittir (borç bakiyesi buna bağlı): silip yeniden ekleyin.
  if (old.debtRole && ((payload.amount !== undefined && payload.amount !== old.amount) || (payload.currency !== undefined && payload.currency !== old.currency) || (payload.cashAccount !== undefined && payload.cashAccount !== old.cashAccount) || (payload.kind !== undefined && payload.kind !== old.kind))) {
    return json({ error: "Borç kaydının tutarı, kasası ve para birimi değiştirilemez; kaydı silip yeniden ekleyin" }, { status: 400 });
  }

  const listLink = await resolveRecordList(session.user, { listId: payload.listId, listName: payload.listName }, db);
  if ("error" in listLink) return json({ error: listLink.error }, { status: 400 });

  const source = payload.source ?? old.source;
  const cashAccountName = payload.cashAccount ?? old.cashAccount;
  // Hiçbir gelir/gider kasadan kopuk olamaz.
  if (kind !== "cash" && !cashAccountName?.trim()) return json({ error: "Gelir/gider bir kasaya bağlı olmalıdır" }, { status: 400 });
  const linkName = kind === "cash" ? source : cashAccountName;

  const result = await db.transaction(async (tx) => {
    const link = await ensureCashAccountLink({ name: linkName, kind, user: session.user }, tx);
    if (link.forbidden) return { forbidden: true as const };
    if (kind === "cash" && payload.listKasa && link.cashAccountId != null) await markListKasa(link.cashAccountId, tx);
    if (kind === "cash" && payload.listKasa === false && link.cashAccountId != null) await unmarkListKasa(link.cashAccountId, tx);
    if (kind === "cash" && payload.rjKasa !== undefined && link.cashAccountId != null) await setRjKasa(link.cashAccountId, payload.rjKasa, tx);
    if (kind === "cash" && payload.sectionId !== undefined && link.cashAccountId != null) await tx.update(cashAccounts).set({ sectionId: payload.sectionId }).where(eq(cashAccounts.id, link.cashAccountId));
    const cashAccount = kind === "cash" ? source : (cashAccountName || "");

    const [updatedRecord] = await tx
      .update(records)
      .set({
        kind,
        date: payload.date ?? old.date,
        source,
        detail: payload.detail ?? old.detail,
        note: payload.note ?? old.note,
        person: payload.person ?? old.person,
        amount: payload.amount ?? old.amount,
        currency: payload.currency ?? old.currency,
        project: payload.project ?? old.project,
        tags: payload.tags ?? old.tags,
        cashAccount,
        cashAccountId: link.cashAccountId,
        sectionId: kind === "cash" ? null : payload.sectionId === undefined ? old.sectionId : payload.sectionId,
        listName: listLink.listName ?? old.listName,
        listId: listLink.listId === undefined ? old.listId : listLink.listId,
        attachments: payload.attachments ?? old.attachments,
        detailTable: payload.detailTable ?? old.detailTable,
        detailTableLayout: payload.detailTableLayout ?? old.detailTableLayout,
        updatedAt: new Date(),
      })
      .where(eq(records.id, id))
      .returning();

    // Cascade: if a cash account's display name changed, keep every record
    // that referenced it by name pointing at the new name. The FK
    // (cashAccountId) already stays correct through a rename on its own —
    // this only refreshes the display-text copy on linked records.
    if (old.kind === "cash" && old.source !== source) {
      await tx.update(records).set({ cashAccount: source }).where(eq(records.cashAccount, old.source));
    }

    const [insertedArchive] = await tx
      .insert(archive)
      .values({
        action: "Düzenlendi",
        userName: session.user.name,
        oldRecord: old,
      })
      .returning();

    return { forbidden: false as const, record: updatedRecord, archiveEntry: insertedArchive, ensuredCash: link.ensuredCashRecord };
  });

  if (result.forbidden) return json({ error: "Forbidden" }, { status: 403 });
  const changed = result.record;
  await logActivity(session.user, {
    category: changed.kind,
    action: "update",
    summary: `${({ income: "Gelir", expense: "Gider", cash: "Kasa" } as Record<string, string>)[changed.kind]} düzenlendi: ${changed.source} — ${formatAmount(changed.amount, changed.currency)}`,
    kasa: changed.kind === "cash" ? changed.source : changed.cashAccount,
    meta: { id: changed.id },
  });
  return json({ record: result.record, archiveEntry: toClientArchiveItem(result.archiveEntry), ensuredCash: result.ensuredCash });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const reason = deleteReason(request);
  if (reason.length < 3) return json({ error: "Silme gerekçesi zorunludur" }, { status: 400 });

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return json({ error: "Record not found" }, { status: 404 });

  if (!canAccessKind(session.user, old.kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  if (old.cashAccountId !== null && !(await canWriteCashAccount(session.user, old.cashAccountId, db))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  // Borç kayıtları: alınan borç girişi doğrudan silinemez; verilen borç ödenmişse önce ödemeler silinmelidir.
  if (old.debtRole === "borrowed") {
    return json({ error: "Borç alındı kaydı doğrudan silinemez; borcu veren kasadaki gideri silin" }, { status: 409 });
  }
  if (old.debtRole === "lent" && old.debtCashAccountId !== null && old.cashAccountId !== null) {
    const repays = await db
      .select({ meta: records.debtMeta })
      .from(records)
      .where(and(eqOp(records.debtRole, "repay"), eqOp(records.cashAccountId, old.debtCashAccountId), eqOp(records.debtCashAccountId, old.cashAccountId), ne(records.id, id)));
    if (repays.some((r) => ((r.meta as DebtMeta) ?? []).some((m) => m.id === old.id))) {
      return json({ error: "Bu borca ödeme yapılmış; önce borç ödemesi giderlerini silin" }, { status: 409 });
    }
  }

  const [archiveEntry] = await db.transaction(async (tx) => {
    if (old.debtRole === "repay") await restoreLentExpenses((old.debtMeta as DebtMeta) ?? [], tx);
    if (old.debtRole === "lent" && old.debtLinkId !== null) await tx.delete(records).where(eq(records.id, old.debtLinkId));
    await tx.delete(records).where(eq(records.id, id));
    return tx
      .insert(archive)
      .values({
        action: "Silindi",
        userName: session.user.name,
        oldRecord: old,
        reason,
      })
      .returning();
  });

  await logActivity(session.user, {
    category: old.kind,
    action: "delete",
    summary: withReason(`${({ income: "Gelir", expense: "Gider", cash: "Kasa" } as Record<string, string>)[old.kind]} silindi: ${old.source} — ${formatAmount(old.amount, old.currency)}`, reason),
    kasa: old.kind === "cash" ? old.source : old.cashAccount,
    meta: { id: old.id },
  });
  return json({ archiveEntry: toClientArchiveItem(archiveEntry) });
});
