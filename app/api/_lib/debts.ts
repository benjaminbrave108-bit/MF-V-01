import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "../../../db";
import { cashAccounts, records } from "../../../db/schema";

// Borç mantığı (Gider eklerken "borç" işareti):
//  - lent:     A kasasında "borç verilen" gider. B kasasında otomatik "Borç Alındı" girişi (borrowed) oluşur.
//  - repay:    B kasası borcunu A'ya öder: B'de "Borç Ödemesi" gideri (repay); A'daki "lent" giderler ödeme kadar azalır.
// borrowed/repay kayıtları kasa bakiyesine girer ama Gelir/Gider toplamlarına girmez (istemci de aynı kuralı uygular).

export type DebtMeta = { id: number; amount: number }[];

const round2 = (n: number) => Math.round(n * 100) / 100;

// B kasasının A kasasına, belirli para biriminde kalan borcu: alınan borç − yapılan ödemeler.
export async function outstandingDebt(debtorId: number, creditorId: number, currency: string, db: DbClient): Promise<number> {
  const rows = await db
    .select({ role: records.debtRole, amount: records.amount })
    .from(records)
    .where(and(eq(records.cashAccountId, debtorId), eq(records.debtCashAccountId, creditorId), eq(records.currency, currency)));
  let sum = 0;
  for (const r of rows) {
    if (r.role === "borrowed") sum += r.amount;
    else if (r.role === "repay") sum -= r.amount;
  }
  return round2(sum);
}

export async function kasaName(id: number, db: DbClient): Promise<string | null> {
  const row = (await db.select({ name: cashAccounts.name }).from(cashAccounts).where(eq(cashAccounts.id, id)).limit(1))[0];
  return row?.name ?? null;
}

// Ödeme tutarı kadar, alacaklı kasadaki "lent" giderleri (en eskiden başlayarak) azaltır; azaltılanları döndürür.
export async function reduceLentExpenses(creditorId: number, debtorId: number, currency: string, amount: number, db: DbClient): Promise<DebtMeta> {
  const lent = await db
    .select()
    .from(records)
    .where(and(eq(records.debtRole, "lent"), eq(records.cashAccountId, creditorId), eq(records.debtCashAccountId, debtorId), eq(records.currency, currency)))
    .orderBy(asc(records.date), asc(records.id));
  let left = round2(amount);
  const meta: DebtMeta = [];
  for (const row of lent) {
    if (left <= 0) break;
    if (row.amount <= 0) continue;
    const take = Math.min(row.amount, left);
    await db.update(records).set({ amount: round2(row.amount - take), updatedAt: new Date() }).where(eq(records.id, row.id));
    meta.push({ id: row.id, amount: round2(take) });
    left = round2(left - take);
  }
  return meta;
}

// "repay" kaydı silinince azaltılan "lent" giderler geri yüklenir.
export async function restoreLentExpenses(meta: DebtMeta, db: DbClient): Promise<void> {
  for (const m of meta) {
    const row = (await db.select({ amount: records.amount }).from(records).where(eq(records.id, m.id)).limit(1))[0];
    if (row) await db.update(records).set({ amount: round2(row.amount + m.amount), updatedAt: new Date() }).where(eq(records.id, m.id));
  }
}
