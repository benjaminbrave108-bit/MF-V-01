import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../../db";
import { cashAccountAccess, cashAccounts, users } from "../../../../../db/schema";
import { requireSuperAdmin } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { parseBody } from "../../../_lib/validate";

const bodySchema = z.object({ cashAccountIds: z.array(z.number().int().positive()).max(5000) });

// GET /api/users/:id/cash-access — bu kullanıcının görebildiği kasa kimlikleri
// (kendi kasaları + kendisine açılan kasalar).
export const GET = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSuperAdmin(request);
  if ("response" in session) return session.response;
  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) return json({ error: "Invalid id" }, { status: 400 });
  const db = getDb();
  const rows = await db.select({ id: cashAccountAccess.cashAccountId }).from(cashAccountAccess).where(eq(cashAccountAccess.userId, userId));
  const owned = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.ownerUserId, userId));
  return json({ cashAccountIds: [...new Set([...rows.map((r) => r.id), ...owned.map((r) => r.id)])] });
});

// PUT /api/users/:id/cash-access — kullanıcının görebileceği kasaları toplu belirler.
// Kullanıcının kendi (sahibi olduğu) kasaları her zaman görünür kalır.
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSuperAdmin(request);
  if ("response" in session) return session.response;
  const userId = Number((await params).id);
  if (!Number.isInteger(userId)) return json({ error: "Invalid id" }, { status: 400 });
  const parsed = await parseBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;

  const db = getDb();
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return json({ error: "Kullanıcı bulunamadı" }, { status: 404 });

  const wanted = new Set(parsed.data.cashAccountIds);
  const owned = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.ownerUserId, userId));
  for (const o of owned) wanted.add(o.id);
  const existingKasas = wanted.size ? await db.select({ id: cashAccounts.id }).from(cashAccounts).where(inArray(cashAccounts.id, [...wanted])) : [];
  const valid = new Set(existingKasas.map((k) => k.id));

  await db.transaction(async (tx) => {
    await tx.delete(cashAccountAccess).where(eq(cashAccountAccess.userId, userId));
    if (valid.size) await tx.insert(cashAccountAccess).values([...valid].map((cashAccountId) => ({ cashAccountId, userId })));
  });
  return json({ ok: true, count: valid.size });
});
