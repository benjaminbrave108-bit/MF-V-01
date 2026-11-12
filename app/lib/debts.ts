import type { RecordItem } from "./types";

// Borç hareketleri (Gider eklerken "borç" işaretiyle oluşur; sunucu mantığı için app/api/_lib/debts.ts):
//  lent     = alacaklı kasadaki "borç verilen" gider (ödemeler geldikçe azalır)
//  borrowed = borç alan kasadaki otomatik giriş
//  repay    = borç alan kasanın borç ödemesi gideri
// borrowed ve repay kasa bakiyesine girer ama Gelir/Gider toplamlarına girmez.
export const isDebtLeg = (x: Pick<RecordItem, "debtRole">) => x.debtRole === "borrowed" || x.debtRole === "repay";

export type DebtPair = {
  key: string;
  debtorId: number;
  debtorName: string;
  creditorId: number;
  creditorName: string;
  currency: string;
  borrowed: number;
  repaid: number;
  outstanding: number;
  // Çiftle ilgili tüm borç kayıtları (en yeni üstte).
  movements: RecordItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Kasa çiftlerine (borçlu → alacaklı, para birimi) göre borç özeti. Yalnızca erişilebilen kayıtlardan hesaplanır.
export function debtPairs(records: RecordItem[]): DebtPair[] {
  const map = new Map<string, DebtPair>();
  const nameOfCreditor = new Map<number, string>();
  for (const x of records) if (x.debtRole === "lent" && x.cashAccountId != null) nameOfCreditor.set(x.cashAccountId, x.cashAccount);
  for (const x of records) {
    if (!x.debtRole || x.cashAccountId == null || x.debtCashAccountId == null) continue;
    // Çift her zaman (borçlu, alacaklı) sırasıyla anahtarlanır.
    const debtorId = x.debtRole === "lent" ? x.debtCashAccountId : x.cashAccountId;
    const creditorId = x.debtRole === "lent" ? x.cashAccountId : x.debtCashAccountId;
    const key = `${debtorId}:${creditorId}:${x.currency}`;
    let pair = map.get(key);
    if (!pair) {
      pair = { key, debtorId, debtorName: "", creditorId, creditorName: "", currency: x.currency, borrowed: 0, repaid: 0, outstanding: 0, movements: [] };
      map.set(key, pair);
    }
    if (x.debtRole === "borrowed") { pair.borrowed += x.amount; pair.debtorName = x.cashAccount; pair.creditorName = pair.creditorName || x.person; }
    if (x.debtRole === "repay") { pair.repaid += x.amount; pair.debtorName = x.cashAccount; pair.creditorName = pair.creditorName || x.person; }
    if (x.debtRole === "lent") pair.creditorName = x.cashAccount;
    pair.movements.push(x);
  }
  return [...map.values()]
    .map((p) => ({
      ...p,
      creditorName: p.creditorName || nameOfCreditor.get(p.creditorId) || "",
      borrowed: round2(p.borrowed),
      repaid: round2(p.repaid),
      outstanding: round2(p.borrowed - p.repaid),
      movements: p.movements.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

// Bir kasanın (borçlu olarak) para birimine göre toplam kalan borcu — yalnızca borcu olan para birimleri.
export function kasaDebtByCurrency(records: RecordItem[], kasaName: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of debtPairs(records)) {
    if (p.debtorName !== kasaName || p.outstanding <= 0.004) continue;
    out[p.currency] = round2((out[p.currency] ?? 0) + p.outstanding);
  }
  return out;
}
