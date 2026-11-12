import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { cashAccounts, kasaSections, settings } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody } from "../_lib/validate";
import { logActivity } from "../_lib/activity";

const SINGLETON_ID = 1;

async function readOrder(): Promise<string[]> {
  const [row] = await getDb().select({ order: settings.cashWorkspaceOrder }).from(settings).where(eq(settings.id, SINGLETON_ID)).limit(1);
  return Array.isArray(row?.order) ? (row.order as string[]) : [];
}

// Kasa Kontrol Merkezi: elle sıralama. Herkes okur (sayfa düzeni için), yalnızca süper yönetici yazar.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  return json({ workspaceOrder: await readOrder() });
});

const orderSchema = z.object({
  // Çalışma alanı anahtarları sırayla (genel / liste / rj / sec-<id>).
  workspaces: z.array(z.string().regex(/^(genel|liste|rj|sec-\d+)$/)).max(200).optional(),
  // Bölüm kimlikleri sırayla (aynı üst alanın bölümleri).
  sections: z.array(z.number().int().positive()).max(500).optional(),
  // Kasa kimlikleri sırayla (aynı alan / bölümün kasaları).
  kasas: z.array(z.number().int().positive()).max(1000).optional(),
});

export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isSuperAdmin) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, orderSchema);
  if ("response" in parsed) return parsed.response;
  const { workspaces, sections, kasas } = parsed.data;
  const db = getDb();
  await db.transaction(async (tx) => {
    if (workspaces) {
      const existing = await tx.select({ id: settings.id }).from(settings).where(eq(settings.id, SINGLETON_ID)).limit(1);
      if (existing[0]) await tx.update(settings).set({ cashWorkspaceOrder: workspaces, updatedAt: new Date() }).where(eq(settings.id, SINGLETON_ID));
      else await tx.insert(settings).values({ id: SINGLETON_ID, typography: {}, cashWorkspaceOrder: workspaces });
    }
    if (sections?.length) {
      const found = await tx.select({ id: kasaSections.id }).from(kasaSections).where(inArray(kasaSections.id, sections));
      const ok = new Set(found.map((r) => r.id));
      for (const [i, id] of sections.filter((x) => ok.has(x)).entries()) await tx.update(kasaSections).set({ sortOrder: i + 1 }).where(eq(kasaSections.id, id));
    }
    if (kasas?.length) {
      const found = await tx.select({ id: cashAccounts.id }).from(cashAccounts).where(inArray(cashAccounts.id, kasas));
      const ok = new Set(found.map((r) => r.id));
      for (const [i, id] of kasas.filter((x) => ok.has(x)).entries()) await tx.update(cashAccounts).set({ sortOrder: i + 1 }).where(eq(cashAccounts.id, id));
    }
  });
  await logActivity(session.user, { category: "workspace", action: "update", summary: "Kasa Kontrol Merkezi: sıralama güncellendi" });
  return json({ ok: true, workspaceOrder: await readOrder() });
});
