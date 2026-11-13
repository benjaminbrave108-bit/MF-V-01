import type { Language, RecordItem } from "./types";

export function total(rows: RecordItem[]) {
  return rows.reduce((a, b) => a + b.amount, 0);
}
// Sums by currency instead of blending unlike units into one number.
// Used for the top-level totals (Dashboard cards, list "Tümü" pills) where
// silently adding e.g. USD and TRY amounts together would show a wrong
// figure; per-record/per-group displays elsewhere still use total()/money()
// since a single named cash account or category is virtually always one
// currency in practice.
export function combineByCurrency(parts: { rows: RecordItem[]; sign?: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of parts) {
    const sign = part.sign ?? 1;
    for (const r of part.rows) out[r.currency] = (out[r.currency] ?? 0) + sign * r.amount;
  }
  return out;
}
export function money(v: number, currency: string = "USD") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
  }).format(v);
}
// Döviz kurları "1 USD = X birim" biçimindedir. USD ise kendisi, kur tanımsızsa null döner.
export type ExchangeRates = Record<string, number>;
export function toUsd(amount: number, currency: string, rates: ExchangeRates): number | null {
  if (currency === "USD") return amount;
  const rate = rates[currency];
  return rate && rate > 0 ? amount / rate : null;
}
// Gösterge sırası: önce $ (USD), sonra Euro, sonra diğer para birimleri (tutarı büyükten küçüğe).
const CURRENCY_RANK: Record<string, number> = { USD: 0, EUR: 1 };
export function orderedMoney(byCurrency: Record<string, number>): [string, number][] {
  return Object.entries(byCurrency)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => (CURRENCY_RANK[a[0]] ?? 2) - (CURRENCY_RANK[b[0]] ?? 2) || Math.abs(b[1]) - Math.abs(a[1]));
}
export function moneyBreakdown(byCurrency: Record<string, number>): string {
  const entries = orderedMoney(byCurrency);
  if (!entries.length) return money(0);
  return entries.map(([currency, v]) => money(v, currency)).join(" + ");
}
export function date(v: string, _language: Language = "tr") {
  const stored = parseStoredDate(v);
  const [year, month, day] = stored.split("-");
  return `${day}.${month}.${year}`;
}
// Stricter sibling of parseStoredDate for Excel import: returns null on an
// unrecognized date instead of silently defaulting to today, so a bad row
// gets rejected and reported rather than misfiled under the wrong day.
export function parseImportDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}
export function parseStoredDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}
export function normalizeRecord(x: RecordItem): RecordItem {
  return {
    ...x,
    detail: x.detail || "",
    tags: Array.isArray(x.tags) ? x.tags : [],
    link: x.link || "",
    cashAccount: x.cashAccount || "",
    listName: x.listName || "",
    attachments: Array.isArray(x.attachments) ? x.attachments : [],
    detailTable: Array.isArray(x.detailTable) ? x.detailTable : [],
    detailTableLayout: {
      cols: Array.isArray(x.detailTableLayout?.cols) ? x.detailTableLayout!.cols : [],
      rows: Array.isArray(x.detailTableLayout?.rows) ? x.detailTableLayout!.rows : [],
      colAlign: Array.isArray(x.detailTableLayout?.colAlign) ? x.detailTableLayout!.colAlign : [],
      cellAlign:
        x.detailTableLayout?.cellAlign && typeof x.detailTableLayout.cellAlign === "object" ? x.detailTableLayout.cellAlign : {},
    },
  };
}
