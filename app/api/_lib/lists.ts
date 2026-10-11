import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DbClient } from "../../../db";
import { cashAccounts, listAllocations, listItems, lists, records, users, workspaceDistributions, workspaceRecipients } from "../../../db/schema";
import type { SessionUser } from "./auth";
import { accessibleCashAccountIds, canWriteCashAccount } from "./cash-access";

// Proje Aşaması 2 — Liste defteri. Çalışma alanı = kasa (cash_accounts):
// kasanın geliri (kasa + gelir kayıtları) alıcılara dağıtılır; kasanın altında
// kodlu listeler vardır; bir listenin ürünleri alıcılara yazılır ve her
// alıcının listelerdeki harcaması çıkar. Okuma kasa erişimine, yazma kasanın
// sahibine / süper admine bağlıdır (bkz. cash-access.ts).
type Actor = Pick<SessionUser, "id" | "isSuperAdmin">;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type WorkspaceAccess = { canRead: boolean; canWrite: boolean };

export async function workspaceAccess(kasaId: number, user: Actor, db: DbClient = getDb()): Promise<WorkspaceAccess> {
  const [kasa] = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, kasaId)).limit(1);
  if (!kasa) return { canRead: false, canWrite: false };
  const canWrite = await canWriteCashAccount(user, kasaId, db);
  if (canWrite) return { canRead: true, canWrite: true };
  const ids = await accessibleCashAccountIds(user, db);
  return { canRead: ids === null || ids.includes(kasaId), canWrite: false };
}

export async function loadListForUser(listId: number, user: Actor, db: DbClient = getDb()) {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  if (!list || list.cashAccountId == null) return { list: null, canRead: false, canWrite: false } as const;
  const access = await workspaceAccess(list.cashAccountId, user, db);
  return { list, ...access } as const;
}

// Kullanıcının yeni liste/çalışma alanı açabileceği kasalar (yazma yetkisi olanlar).
export async function writableKasas(user: Actor, db: DbClient = getDb()) {
  const rows = await db.select({ id: cashAccounts.id, name: cashAccounts.name, ownerUserId: cashAccounts.ownerUserId }).from(cashAccounts).orderBy(cashAccounts.name);
  return rows.filter((k) => user.isSuperAdmin || k.ownerUserId === user.id).map((k) => ({ id: k.id, name: k.name }));
}

// Listesi, alıcısı veya dağıtımı olan çalışma alanlarının tam ekran verisi.
export async function buildWorkspaces(user: Actor, only: number[] | null = null, db: DbClient = getDb()) {
  const accessible = await accessibleCashAccountIds(user, db);
  const [withLists, withRecipients] = await Promise.all([
    db.selectDistinct({ id: lists.cashAccountId }).from(lists),
    db.selectDistinct({ id: workspaceRecipients.cashAccountId }).from(workspaceRecipients),
  ]);
  let kasaIds = [...new Set([...withLists, ...withRecipients].map((r) => r.id).filter((v): v is number => v != null))];
  if (accessible !== null) kasaIds = kasaIds.filter((id) => accessible.includes(id));
  if (only) kasaIds = kasaIds.filter((id) => only.includes(id));
  if (!kasaIds.length) return [];

  const [kasaRows, listRows, recipientRows, distRows, incomeRows] = await Promise.all([
    db
      .select({ id: cashAccounts.id, name: cashAccounts.name, ownerUserId: cashAccounts.ownerUserId, ownerName: users.name })
      .from(cashAccounts)
      .leftJoin(users, eq(users.id, cashAccounts.ownerUserId))
      .where(inArray(cashAccounts.id, kasaIds)),
    db.select().from(lists).where(inArray(lists.cashAccountId, kasaIds)).orderBy(lists.date, lists.id),
    db.select().from(workspaceRecipients).where(inArray(workspaceRecipients.cashAccountId, kasaIds)).orderBy(workspaceRecipients.id),
    db.select().from(workspaceDistributions).where(inArray(workspaceDistributions.cashAccountId, kasaIds)).orderBy(workspaceDistributions.date, workspaceDistributions.id),
    db
      .select({ cashAccountId: records.cashAccountId, amount: records.amount, currency: records.currency })
      .from(records)
      .where(and(inArray(records.cashAccountId, kasaIds), inArray(records.kind, ["cash", "income"]))),
  ]);
  const listIds = listRows.map((l) => l.id);
  const itemRows = listIds.length ? await db.select().from(listItems).where(inArray(listItems.listId, listIds)).orderBy(listItems.position, listItems.id) : [];
  const allocRows = listIds.length ? await db.select().from(listAllocations).where(inArray(listAllocations.listId, listIds)) : [];

  const workspaces = await Promise.all(
    kasaRows.map(async (kasa) => {
      const recipients = recipientRows.filter((r) => r.cashAccountId === kasa.id);
      const distributions = distRows.filter((d) => d.cashAccountId === kasa.id);
      const wsLists = listRows
        .filter((l) => l.cashAccountId === kasa.id)
        .map((l) => {
          const items = itemRows.filter((i) => i.listId === l.id);
          const byRecipient: Record<number, number> = {};
          for (const al of allocRows.filter((x) => x.listId === l.id)) if (al.amount > 0) byRecipient[al.recipientId] = round2(al.amount);
          const allocated = round2(Object.values(byRecipient).reduce((x, y) => x + y, 0));
          return {
            id: l.id,
            code: l.code,
            name: l.name,
            date: l.date,
            status: l.status as "open" | "closed",
            note: l.note,
            itemCount: items.length,
            itemsTotal: round2(items.reduce((x, i) => x + i.amount, 0)),
            total: round2(l.amount),
            byRecipient,
            // Alıcılara dağıtılmamış kısım (liste gideri − dağıtılan).
            unassigned: round2(l.amount - allocated),
            items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount, recipientId: i.recipientId, note: i.note })),
          };
        });
      const incomeRowsForKasa = incomeRows.filter((r) => r.cashAccountId === kasa.id);
      const income = round2(incomeRowsForKasa.reduce((a, r) => a + r.amount, 0));
      const currencyCount = new Map<string, number>();
      for (const r of incomeRowsForKasa) currencyCount.set(r.currency, (currencyCount.get(r.currency) ?? 0) + 1);
      const currency = [...currencyCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
      const distributed = round2(distributions.reduce((a, d) => a + d.amount, 0));
      const expense = round2(wsLists.reduce((a, l) => a + l.total, 0));
      const balances = recipients.map((r) => {
        const received = round2(distributions.filter((d) => d.recipientId === r.id).reduce((a, d) => a + d.amount, 0));
        const perList: Record<number, number> = {};
        for (const l of wsLists) if (l.byRecipient[r.id]) perList[l.id] = l.byRecipient[r.id];
        const spent = round2(Object.values(perList).reduce((a, v) => a + v, 0));
        return { recipientId: r.id, name: r.name, received, spent, balance: round2(received - spent), perList };
      });
      return {
        cashAccountId: kasa.id,
        name: kasa.name,
        ownerName: kasa.ownerName ?? "",
        canWrite: await canWriteCashAccount(user, kasa.id, db),
        currency,
        recipients: recipients.map((r) => ({ id: r.id, name: r.name })),
        distributions: distributions.map((d) => ({ id: d.id, recipientId: d.recipientId, amount: d.amount, date: d.date, note: d.note })),
        lists: wsLists,
        balances,
        // Kasada kalan + alıcılarda kalan = gelir − gider (dağıtım ve ürünler tamamen girildiyse).
        totals: {
          income,
          distributed,
          expense,
          kasaRemaining: round2(income - distributed),
          recipientsNet: round2(balances.reduce((a, b) => a + b.balance, 0)),
          unassigned: round2(wsLists.reduce((a, l) => a + l.unassigned, 0)),
        },
      };
    }),
  );
  workspaces.sort((a, b) => a.name.localeCompare(b.name));
  return workspaces;
}

// Bir gelir/gider kaydı kaydedilirken liste bağlantısı (eski "Liste Kaydı" alanı):
// yalnızca serbest listName korunur; listId verilmişse varlığı ve yazma yetkisi doğrulanır.
export async function resolveRecordList(
  user: Actor,
  input: { listId?: number | null; listName?: string },
  db: DbClient = getDb(),
): Promise<{ error: string } | { listId: number | null | undefined; listName: string | undefined }> {
  if (input.listId === null) return { listId: null, listName: "" };
  if (typeof input.listId === "number") {
    const { list, canWrite } = await loadListForUser(input.listId, user, db);
    if (!list) return { error: "Liste bulunamadı" };
    if (!canWrite) return { error: "Bu listeye kayıt ekleme yetkiniz yok" };
    return { listId: list.id, listName: list.name };
  }
  return { listId: undefined, listName: input.listName };
}

// Bir listenin alıcı dağılımını (tamamını) yazar; toplam liste gider tutarını aşamaz.
// Hata mesajı döndürürse hiçbir şey yazılmamıştır.
export async function writeAllocations(
  tx: DbClient,
  list: { id: number; cashAccountId: number | null },
  amount: number,
  allocations: { recipientId: number; amount: number }[],
): Promise<string | null> {
  const rows = allocations.filter((a) => a.amount > 0);
  if (new Set(rows.map((r) => r.recipientId)).size !== rows.length) return "Aynı alıcı birden çok kez girilemez";
  const sum = round2(rows.reduce((a, r) => a + r.amount, 0));
  if (sum > amount + 0.005) return "Alıcılara dağıtılan toplam, liste giderini aşamaz";
  if (rows.length) {
    const valid = await tx
      .select({ id: workspaceRecipients.id, cashAccountId: workspaceRecipients.cashAccountId })
      .from(workspaceRecipients)
      .where(inArray(workspaceRecipients.id, rows.map((r) => r.recipientId)));
    if (valid.length !== rows.length || valid.some((v) => v.cashAccountId !== list.cashAccountId)) return "Alıcı bu çalışma alanında yok";
  }
  await tx.delete(listAllocations).where(eq(listAllocations.listId, list.id));
  if (rows.length) await tx.insert(listAllocations).values(rows.map((r) => ({ listId: list.id, recipientId: r.recipientId, amount: r.amount })));
  return null;
}
