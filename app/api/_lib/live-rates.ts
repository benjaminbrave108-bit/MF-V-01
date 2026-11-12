import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { settings } from "../../../db/schema";

// Günlük kur: open.er-api.com (anahtarsız, günde bir güncellenir). Kurlar "1 USD = X birim".
export const RATE_CURRENCIES = ["EUR", "TRY", "IQD", "SYP", "AED"] as const;

export type RatesInfo = { manual: Record<string, number>; auto: Record<string, number>; date: string | null; rates: Record<string, number> };

let inflight: Promise<void> | null = null;
let lastAttempt = 0;

const today = () => new Date().toISOString().slice(0, 10);

async function fetchAuto(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== "success" || !data.rates) return null;
    const out: Record<string, number> = {};
    for (const c of RATE_CURRENCIES) {
      const v = data.rates[c];
      if (typeof v === "number" && v > 0) out[c] = v;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function refreshAuto(): Promise<void> {
  const auto = await fetchAuto();
  if (!auto) return;
  const db = getDb();
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).limit(1);
  if (!existing[0]) await db.insert(settings).values({ id: 1, typography: {} });
  await db.update(settings).set({ autoExchangeRates: auto, autoExchangeRatesDate: today() }).where(eq(settings.id, 1));
}

// Kurlar o gün çekilmediyse arka planda bir kez çeker (hata olursa eski kurlar kalır; en fazla 10 dakikada bir dener).
export async function readRatesInfo(force = false): Promise<RatesInfo> {
  const db = getDb();
  const read = async () => (await db.select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
  let row = await read();
  const haveAuto = (row?.autoExchangeRates as Record<string, number> | null) ?? {};
  const missingCurrency = RATE_CURRENCIES.some((c) => !(c in haveAuto));
  if (force || missingCurrency || (row?.autoExchangeRatesDate ?? null) !== today()) {
    if (force || Date.now() - lastAttempt > 10 * 60 * 1000) {
      lastAttempt = Date.now();
      inflight ??= refreshAuto().finally(() => { inflight = null; });
      await inflight;
      row = await read();
    }
  }
  const manual = (row?.exchangeRates as Record<string, number>) ?? {};
  const auto = (row?.autoExchangeRates as Record<string, number>) ?? {};
  return { manual, auto, date: row?.autoExchangeRatesDate ?? null, rates: { ...auto, ...manual } };
}
