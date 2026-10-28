import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { cashAccountAccess, cashAccounts, users } from "../../../db/schema";
import { requireSuperAdmin } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody } from "../_lib/validate";

const bodySchema = z.object({
  cashAccountIds: z.array(z.number().int().positive()).min(1).max(5000),
  // kullanıcı kimliği -> bu kapsamdaki (çalışma alanı / kasa) görebileceği kasa kimlikleri
  grants: z.record(z.string(), z.array(z.number().int().positive()).max(5000)),
});

function parseIds(request: Request): number[] {
  const raw = new URL(request.url).searchParams.get("cashAccountIds") ?? "";
  return [...new Set(raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

// GET /api/workspace-access?cashAccountIds=1,2,3 — çalışma alanı / kasa için "kimler görebilir" matrisi.
// Yanıt: yönetici olmayan kullanıcılar ve her birinin bu kasalar içinde görebildiği kasa kimlikleri
// (kendi sahibi olduğu kasalar her zaman görünür sayılır).
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSuperAdmin(request);
  if ("response" in session) return session.response;
  const ids = parseIds(request);
  if (!ids.length) return json({ users: [], grants: {} });
  const db = getDb();
  const userRows = await db.select({ id: users.id, name: users.name, username: users.username, isSuperAdmin: users.isSuperAdmin }).from(users).orderBy(users.id);
  const access = await db.select().from(cashAccountAccess).where(inArray(cashAccountAccess.cashAccountId, ids));
  const owned = await db.select({ id: cashAccounts.id, owner: cashAccounts.ownerUserId }).from(cashAccounts).where(inArray(cashAccounts.id, ids));
  const grants: Record<string, number[]> = {};
  for (const u of userRows) grants[String(u.id)] = [];
  for (const a of access) grants[String(a.userId)]?.push(a.cashAccountId);
  for (const o of owned) if (o.owner != null && grants[String(o.owner)] && !grants[String(o.owner)].includes(o.id)) grants[String(o.owner)].push(o.id);
  return json({ users: userRows.filter((u) => !u.isSuperAdmin), grants });
});

// PUT /api/workspace-access — gönderilen kullanıcılar için, verilen kasa kümesi içindeki erişimi toplu değiştirir.
// Kümenin dışındaki kasalara dokunulmaz; kullanıcının kendi sahibi olduğu kasalar her zaman görünür kalır.
export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireSuperAdmin(request);
  if ("response" in session) return session.response;
  const parsed = await parseBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;
  const scope = new Set(parsed.data.cashAccountIds);

  const db = getDb();
  const owned = await db.select({ id: cashAccounts.id, owner: cashAccounts.ownerUserId }).from(cashAccounts).where(inArray(cashAccounts.id, [...scope]));
  const existing = new Set(owned.map((o) => o.id));

  await db.transaction(async (tx) => {
    for (const [userKey, visible] of Object.entries(parsed.data.grants)) {
      const userId = Number(userKey);
      if (!Number.isInteger(userId)) continue;
      const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!target) continue;
      const wanted = new Set(visible.filter((id) => scope.has(id) && existing.has(id)));
      for (const o of owned) if (o.owner === userId) wanted.add(o.id);
      await tx.delete(cashAccountAccess).where(and(eq(cashAccountAccess.userId, userId), inArray(cashAccountAccess.cashAccountId, [...scope])));
      if (wanted.size) await tx.insert(cashAccountAccess).values([...wanted].map((cashAccountId) => ({ cashAccountId, userId })));
    }
  });
  return json({ ok: true });
});
