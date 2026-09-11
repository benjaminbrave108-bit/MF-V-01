import { and, eq } from "drizzle-orm";
import { getDb, type DbClient } from "../../../db";
import { cashAccountAccess, cashAccounts } from "../../../db/schema";
import type { SessionUser } from "./auth";

// Kasa-level access control (Ayarlar > Kasa Erişimi). Independent of the
// page-level `permissions` gate in auth.ts: a user can have the "cash" page
// permission and still see zero kasas until one is actually shared with
// them, or they create their own (admin/super admin only — see
// canCreateCashAccounts).
//
// Super admins bypass all of this — every function here returns "everything"
// for them without touching cash_account_access at all.

// Admins/super admins can always create a kasa; a plain user can too, but
// only if they actually have the "cash" (Kasalar) page permission — someone
// with no reason to be on that page at all still can't spin up a kasa.
export function canCreateCashAccounts(user: Pick<SessionUser, "isAdmin" | "isSuperAdmin" | "permissions">): boolean {
  return user.isAdmin || user.isSuperAdmin || user.permissions.includes("cash");
}

// The set of cash_accounts.id values this user may see records/reports for.
// Returns null to mean "no filter needed" (super admin — sees everything).
export async function accessibleCashAccountIds(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  db: DbClient = getDb(),
): Promise<number[] | null> {
  if (user.isSuperAdmin) return null;
  const rows = await db
    .select({ id: cashAccountAccess.cashAccountId })
    .from(cashAccountAccess)
    .where(eq(cashAccountAccess.userId, user.id));
  return rows.map((r) => r.id);
}

export async function canAccessCashAccount(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  cashAccountId: number,
  db: DbClient = getDb(),
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const rows = await db
    .select({ id: cashAccountAccess.cashAccountId })
    .from(cashAccountAccess)
    .where(and(eq(cashAccountAccess.userId, user.id), eq(cashAccountAccess.cashAccountId, cashAccountId)))
    .limit(1);
  return rows.length > 0;
}

// Whether `user` may write (create/edit/delete a record on, or transfer
// money out of) a given kasa: only the owner, or a super admin — sharing a
// kasa (cash_account_access) only ever grants read access. Distinct from
// canAccessCashAccount, which a shared *viewer* also passes.
export async function canWriteCashAccount(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  cashAccountId: number,
  db: DbClient = getDb(),
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const rows = await db
    .select({ ownerUserId: cashAccounts.ownerUserId })
    .from(cashAccounts)
    .where(eq(cashAccounts.id, cashAccountId))
    .limit(1);
  return rows[0]?.ownerUserId === user.id;
}

// Whether `user` may manage sharing (grant/revoke view access, or toggle
// dashboard-share) for a given kasa. A super admin can manage any kasa.
// Everyone else gets the same right super admin has for any kasa they can
// already see — owner or an existing shared viewer — so managing sharing is
// no longer an owner-only privilege; it just can't be exercised on a kasa
// the user has no visibility into in the first place (nothing new leaks:
// canAccessCashAccount is the actual visibility gate, this only decides who
// may flip the switches on a kasa already visible to them).
export async function canManageCashAccountAccess(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  cashAccountId: number,
  db: DbClient = getDb(),
): Promise<boolean> {
  if (user.isSuperAdmin) return true;
  const [ownerRows, accessRows] = await Promise.all([
    db.select({ ownerUserId: cashAccounts.ownerUserId }).from(cashAccounts).where(eq(cashAccounts.id, cashAccountId)).limit(1),
    db
      .select({ cashAccountId: cashAccountAccess.cashAccountId })
      .from(cashAccountAccess)
      .where(and(eq(cashAccountAccess.userId, user.id), eq(cashAccountAccess.cashAccountId, cashAccountId)))
      .limit(1),
  ]);
  return ownerRows[0]?.ownerUserId === user.id || accessRows.length > 0;
}

// Ensures the given user can see their own newly-created kasa immediately
// (owner is implicitly granted, matching "kendi kasasını oluşturabilir").
export async function grantCashAccountAccess(cashAccountId: number, userId: number, db: DbClient = getDb()): Promise<void> {
  await db.insert(cashAccountAccess).values({ cashAccountId, userId }).onConflictDoNothing();
}

export async function revokeCashAccountAccess(cashAccountId: number, userId: number, db: DbClient = getDb()): Promise<void> {
  await db
    .delete(cashAccountAccess)
    .where(and(eq(cashAccountAccess.cashAccountId, cashAccountId), eq(cashAccountAccess.userId, userId)));
}

// Owner-controlled opt-in for Ayarlar > Görüntüle (see cashAccounts.dashboardShareEnabled).
export async function setDashboardShareEnabled(cashAccountId: number, enabled: boolean, db: DbClient = getDb()): Promise<void> {
  await db.update(cashAccounts).set({ dashboardShareEnabled: enabled, updatedAt: new Date() }).where(eq(cashAccounts.id, cashAccountId));
}

// Same as accessibleCashAccountIds but resolved to kasa *names* — used to
// scope tables that only carry the old free-text kasa name (archive's
// jsonb oldRecord snapshot, prepared_reports.cashAccount) rather than a
// cashAccountId column. Returns null for "no filter" (super admin).
export async function accessibleCashAccountNames(
  user: Pick<SessionUser, "id" | "isSuperAdmin">,
  db: DbClient = getDb(),
): Promise<string[] | null> {
  if (user.isSuperAdmin) return null;
  const rows = await db
    .select({ name: cashAccounts.name })
    .from(cashAccounts)
    .innerJoin(cashAccountAccess, eq(cashAccountAccess.cashAccountId, cashAccounts.id))
    .where(eq(cashAccountAccess.userId, user.id));
  return rows.map((r) => r.name);
}
