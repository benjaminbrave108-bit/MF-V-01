import { and, eq } from "drizzle-orm";
import { getDb, type DbClient } from "../../../db";
import { cashAccounts, records } from "../../../db/schema";
import { canAccessCashAccount, canCreateCashAccounts, canWriteCashAccount, grantCashAccountAccess } from "./cash-access";
import type { SessionUser } from "./auth";

export function fallbackKasaNameFor(kind: string): string {
  if (kind === "income") return "Diğer";
  if (kind === "expense") return "Diğer Giderler";
  return "";
}

function isFallbackKasaName(name: string): boolean {
  return name === fallbackKasaNameFor("income") || name === fallbackKasaNameFor("expense");
}

export async function findCashAccountByName(name: string, db: DbClient) {
  const rows = await db.select().from(cashAccounts).where(eq(cashAccounts.name, name)).limit(1);
  return rows[0] ?? null;
}

export async function createCashAccount(name: string, ownerUserId: number | null, db: DbClient) {
  const [created] = await db.insert(cashAccounts).values({ name, ownerUserId }).returning();
  return created;
}

// Mirrors the client's previous `ensureFallbackKasa`: if a record needs a
// default cash account bucket that doesn't exist yet as its own "cash"
// record, create one so it shows up in Kasalar. Scoped by cashAccountId (not
// just the name) since two different owners can now hold same-named
// buckets — see the fallback branch of ensureCashAccountLink. Accepts a
// transaction so callers can make this part of a single atomic write.
export async function ensureFallbackKasa(name: string, cashAccountId: number, db: DbClient = getDb()) {
  if (!name) return null;
  const existing = await db
    .select()
    .from(records)
    .where(and(eq(records.kind, "cash"), eq(records.cashAccountId, cashAccountId)))
    .limit(1);
  if (existing[0]) return null;
  const [created] = await db
    .insert(records)
    .values({
      kind: "cash",
      date: new Date().toISOString().slice(0, 10),
      source: name,
      amount: 0,
      cashAccountId,
    })
    .returning();
  return created;
}

// Whether `user` may see (and comment on) a given record: the same
// kind-permission + kasa-visibility combo GET /api/records already scopes
// its list by (see scopeToAccessibleKasas there) — a record with no kasa
// link at all stays visible to anyone with the page permission.
export async function canAccessRecord(
  user: Pick<SessionUser, "id" | "isAdmin" | "isSuperAdmin" | "permissions">,
  record: { kind: string; cashAccountId: number | null },
  db: DbClient = getDb(),
): Promise<boolean> {
  if (!user.isAdmin && !user.permissions.includes(record.kind as SessionUser["permissions"][number])) return false;
  if (record.cashAccountId === null) return true;
  return canAccessCashAccount(user, record.cashAccountId, db);
}

export type CashAccountLinkResult =
  | { forbidden: true }
  | { forbidden: false; cashAccountId: number | null; ensuredCashRecord: typeof records.$inferSelect | null };

// Resolves (and, where the caller is allowed to, creates) the cash_accounts
// row a record write should link to, enforcing kasa-level WRITE access along
// the way — see Ayarlar > Kasa Erişimi / the "1. seçenek" access model.
// Sharing a kasa only ever grants read access (see canAccessCashAccount for
// that); writing to an existing kasa always requires actually owning it (or
// being a super admin) — see canWriteCashAccount.
//
// - kind='cash': `name` is the kasa itself. An existing kasa requires the
//   writer to own it; a brand new name requires canCreateCashAccounts
//   (admin/super admin/"cash" permission) and grants the creator access.
// - kind='income'|'expense': `name` (payload.cashAccount, or the fallback
//   bucket if empty) must resolve to a kasa the writer owns — except the two
//   fallback names ("Diğer" / "Diğer Giderler"), which never mean "join
//   whoever already owns that name": each user gets (and is silently routed
//   to) their OWN bucket under that name, so unassigned income/expense never
//   leaks between users who never explicitly shared anything. The
//   first-ever writer of a fallback name keeps it unsuffixed; everyone else
//   gets a "<name> (username)" bucket of their own.
export async function ensureCashAccountLink(
  { name, kind, user }: { name: string; kind: string; user: SessionUser },
  db: DbClient = getDb(),
): Promise<CashAccountLinkResult> {
  if (kind === "cash") {
    if (!name) return { forbidden: false, cashAccountId: null, ensuredCashRecord: null };
    const existing = await findCashAccountByName(name, db);
    if (existing) {
      if (!(await canWriteCashAccount(user, existing.id, db))) return { forbidden: true };
      return { forbidden: false, cashAccountId: existing.id, ensuredCashRecord: null };
    }
    if (!canCreateCashAccounts(user)) return { forbidden: true };
    const created = await createCashAccount(name, user.id, db);
    await grantCashAccountAccess(created.id, user.id, db);
    return { forbidden: false, cashAccountId: created.id, ensuredCashRecord: null };
  }

  const resolvedName = name || fallbackKasaNameFor(kind);
  if (!resolvedName) return { forbidden: false, cashAccountId: null, ensuredCashRecord: null };

  if (isFallbackKasaName(resolvedName)) {
    let own = await findCashAccountByName(resolvedName, db);
    let personalName = resolvedName;
    if (own && own.ownerUserId !== user.id) {
      personalName = `${resolvedName} (${user.username})`;
      own = await findCashAccountByName(personalName, db);
    }
    if (!own) {
      own = await createCashAccount(personalName, user.id, db);
      await grantCashAccountAccess(own.id, user.id, db);
    }
    const ensuredCashRecord = await ensureFallbackKasa(personalName, own.id, db);
    return { forbidden: false, cashAccountId: own.id, ensuredCashRecord };
  }

  const existing = await findCashAccountByName(resolvedName, db);
  if (!existing) return { forbidden: true };
  if (!(await canWriteCashAccount(user, existing.id, db))) {
    return { forbidden: true };
  }

  return { forbidden: false, cashAccountId: existing.id, ensuredCashRecord: null };
}
