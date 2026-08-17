import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { blockedIps, sessions, users } from "../../../db/schema";

export async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const db = getDb();
  const rows = await db.select().from(blockedIps).where(eq(blockedIps.ip, ip)).limit(1);
  return rows.length > 0;
}

export async function blockIp(ip: string, reason: string): Promise<void> {
  if (!ip || ip === "unknown") return;
  const db = getDb();
  await db.insert(blockedIps).values({ ip, reason }).onConflictDoNothing();
}

export async function unblockIp(ip: string): Promise<void> {
  const db = getDb();
  await db.delete(blockedIps).where(eq(blockedIps.ip, ip));
}

export async function listBlockedIps() {
  const db = getDb();
  return db.select().from(blockedIps).orderBy(desc(blockedIps.createdAt));
}

export async function lockUserAccount(userId: number, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ locked: true, lockedAt: new Date(), lockReason: reason })
    .where(eq(users.id, userId));
  // Kill any session the account already had open elsewhere.
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function unlockUserAccount(userId: number): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ locked: false, lockedAt: null, lockReason: "" })
    .where(eq(users.id, userId));
}
