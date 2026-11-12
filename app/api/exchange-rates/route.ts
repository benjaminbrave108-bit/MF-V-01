import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { settings } from "../../../db/schema";
import { requireAdmin, requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody } from "../_lib/validate";
import { logActivity } from "../_lib/activity";
import { readRatesInfo } from "../_lib/live-rates";

// Kurlar "1 USD = X birim" biçiminde tutulur (ör. EUR 0.92, SYP 13000). USD karşılığı = tutar / kur.
const CURRENCIES = ["EUR", "TRY", "IQD", "SYP", "AED"] as const;
const bodySchema = z.object({
  rates: z
    .record(z.string(), z.number().positive().max(1e12))
    .refine((r) => Object.keys(r).every((k) => (CURRENCIES as readonly string[]).includes(k)), "Geçersiz para birimi"),
});

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  // ?refresh=1 (yalnızca yönetici): günlük kuru hemen yeniden çeker.
  const force = new URL(request.url).searchParams.get("refresh") === "1" && session.user.isAdmin;
  return json(await readRatesInfo(force));
});

export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;
  const parsed = await parseBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;
  const db = getDb();
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1)).limit(1);
  if (!existing[0]) await db.insert(settings).values({ id: 1, typography: {} });
  await db.update(settings).set({ exchangeRates: parsed.data.rates, updatedAt: new Date() }).where(eq(settings.id, 1));
  await logActivity(session.user, { category: "user", action: "rates", summary: `Döviz kurları güncellendi: ${Object.entries(parsed.data.rates).map(([c, v]) => `1 USD = ${v} ${c}`).join(", ")}` });
  return json(await readRatesInfo());
});
