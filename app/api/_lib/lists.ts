import { eq, inArray } from "drizzle-orm";
import { getDb, type DbClient } from "../../../db";
import { cashAccountAccess, cashAccounts, listDistributions, listExpenseShares, listMembers, lists, records, users } from "../../../db/schema";
import type { SessionUser } from "./auth";

// Proje Aşaması 2 — Liste defteri. Bir listeyi görebilmek için: listenin
// çalışma alanının (ownerUserId) sahibi olmak, süper admin olmak veya o
// sahibin en az bir kasasına erişimi olmak gerekir. Yazma (liste/üye/dağıtım/
// paylaşım düzenleme) yalnızca sahibe veya süper admine açıktır — kasa
// paylaşımı yalnızca okuma yetkisi verir (bkz. canWriteCashAccount).
type Actor = Pick<SessionUser, "id" | "isSuperAdmin">;

export async function visibleListOwnerIds(user: Actor, db: DbClient = getDb()): Promise<number[] | null> {
  if (user.isSuperAdmin) return null;
  const shared = await db
    .selectDistinct({ ownerUserId: cashAccounts.ownerUserId })
    .from(cashAccountAccess)
    .innerJoin(cashAccounts, eq(cashAccounts.id, cashAccountAccess.cashAccountId))
    .where(eq(cashAccountAccess.userId, user.id));
  const ids = new Set<number>([user.id]);
  for (const row of shared) if (row.ownerUserId != null) ids.add(row.ownerUserId);
  return [...ids];
}

export async function loadListForUser(listId: number, user: Actor, db: DbClient = getDb()) {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId)).limit(1);
  if (!list) return { list: null, canRead: false, canWrite: false } as const;
  const canWrite = user.isSuperAdmin || list.ownerUserId === user.id;
  if (canWrite) return { list, canRead: true, canWrite } as const;
  const owners = await visibleListOwnerIds(user, db);
  const canRead = owners === null || (list.ownerUserId != null && owners.includes(list.ownerUserId));
  return { list, canRead, canWrite: false } as const;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Bir listenin tüm ekran verisi: üyeler, dağıtımlar, liste gelir/gider kayıtları
// (gider başına paylaşımlarıyla) ve hesaplanmış özet/kişi bakiyeleri.
export async function buildListDetails(listIds: number[], user: Actor, db: DbClient = getDb()) {
  if (!listIds.length) return [];
  const [listRows, memberRows, distRows, recordRows] = await Promise.all([
    db
      .select({ list: lists, ownerName: users.name })
      .from(lists)
      .leftJoin(users, eq(users.id, lists.ownerUserId))
      .where(inArray(lists.id, listIds)),
    db.select().from(listMembers).where(inArray(listMembers.listId, listIds)).orderBy(listMembers.id),
    db.select().from(listDistributions).where(inArray(listDistributions.listId, listIds)).orderBy(listDistributions.date, listDistributions.id),
    db.select().from(records).where(inArray(records.listId, listIds)).orderBy(records.date, records.id),
  ]);
  const expenseIds = recordRows.filter((r) => r.kind === "expense").map((r) => r.id);
  const shareRows = expenseIds.length ? await db.select().from(listExpenseShares).where(inArray(listExpenseShares.recordId, expenseIds)) : [];

  return listRows.map(({ list, ownerName }) => {
    const members = memberRows.filter((m) => m.listId === list.id);
    const distributions = distRows.filter((d) => d.listId === list.id);
    const listRecords = recordRows.filter((r) => r.listId === list.id);
    const incomes = listRecords.filter((r) => r.kind === "income");
    const expenses = listRecords
      .filter((r) => r.kind === "expense")
      .map((r) => ({
        id: r.id,
        date: r.date,
        source: r.source,
        detail: r.detail,
        amount: r.amount,
        currency: r.currency,
        shares: shareRows.filter((s) => s.recordId === r.id).map((s) => ({ memberId: s.memberId, amount: s.amount })),
      }));
    const incomeTotal = round2(incomes.reduce((a, r) => a + r.amount, 0));
    const expenseTotal = round2(expenses.reduce((a, r) => a + r.amount, 0));
    const distributedTotal = round2(distributions.reduce((a, d) => a + d.amount, 0));
    const balances = members.map((m) => {
      const received = round2(distributions.filter((d) => d.memberId === m.id).reduce((a, d) => a + d.amount, 0));
      const share = round2(expenses.reduce((a, e) => a + (e.shares.find((s) => s.memberId === m.id)?.amount ?? 0), 0));
      return { memberId: m.id, name: m.name, received, share, balance: round2(received - share) };
    });
    const unsharedExpense = round2(expenses.reduce((a, e) => a + e.amount - e.shares.reduce((x, s) => x + s.amount, 0), 0));
    return {
      id: list.id,
      code: list.code,
      name: list.name,
      date: list.date,
      currency: list.currency,
      ownerUserId: list.ownerUserId,
      ownerName: ownerName ?? "",
      canWrite: user.isSuperAdmin || list.ownerUserId === user.id,
      members: members.map((m) => ({ id: m.id, name: m.name })),
      distributions: distributions.map((d) => ({ id: d.id, memberId: d.memberId, amount: d.amount, date: d.date, note: d.note })),
      incomes: incomes.map((r) => ({ id: r.id, date: r.date, source: r.source, detail: r.detail, amount: r.amount, currency: r.currency })),
      expenses,
      balances,
      // Kişi bakiyeleri + liste kasası = gelir − gider (dağıtım ve paylaşımlar
      // tamamen girildiyse); fark "paylaştırılmamış gider"dir.
      totals: {
        income: incomeTotal,
        expense: expenseTotal,
        distributed: distributedTotal,
        listCash: round2(incomeTotal - distributedTotal),
        unsharedExpense,
        net: round2(incomeTotal - expenseTotal),
      },
    };
  });
}

// Bir gelir/gider kaydı kaydedilirken liste bağlantısını çözer. `listId`
// verilmişse o listeye bağlanır (yazma yetkisi gerekir) ve listName listenin
// adından türetilir; `null` ise bağ kaldırılır; hiçbiri verilmediyse (eski
// istemciler/içe aktarma) yalnızca listName'e göre sahibin listesi aranır.
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
  const name = input.listName?.trim();
  if (name) {
    const rows = await db.select().from(lists).where(eq(lists.name, name));
    const match = rows.find((l) => l.ownerUserId === user.id) ?? (user.isSuperAdmin ? rows[0] : undefined);
    if (match) return { listId: match.id, listName: match.name };
    return { listId: null, listName: input.listName };
  }
  return { listId: undefined, listName: input.listName };
}
