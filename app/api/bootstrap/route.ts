import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { archive, financeNotes, preparedReports, records, settings, users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { accessibleCashAccountIds, accessibleCashAccountNames } from "../_lib/cash-access";
import { json, withErrorHandling } from "../_lib/http";
import { toClientArchiveItem } from "../_lib/archive";
import type { Kind } from "../_lib/types";

const SETTINGS_ID = 1;
const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function toClientUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    roleLabel: row.roleLabel,
    isAdmin: row.isAdmin,
    isSuperAdmin: row.isSuperAdmin,
    permissions: row.permissions,
    locked: row.locked,
    lockedAt: row.lockedAt,
    lockReason: row.lockReason,
  };
}

// A record with no kasa link (cashAccountId null) stays visible to anyone
// with the page permission — see scopeToAccessibleKasas in
// app/api/records/route.ts for the same rule.
function scopeRecordsToAccessibleKasas<T extends { cashAccountId: number | null }>(rows: T[], accessibleIds: number[] | null): T[] {
  if (accessibleIds === null) return rows;
  const allowed = new Set(accessibleIds);
  return rows.filter((row) => row.cashAccountId === null || allowed.has(row.cashAccountId));
}

// Archive entries and prepared reports only carry the kasa's free-text name
// (jsonb snapshot / cashAccount column), not a cashAccountId — see
// accessibleCashAccountNames.
function kasaNameOf(oldRecord: { kind: string; source: string; cashAccount: string }): string {
  return oldRecord.kind === "cash" ? oldRecord.source : oldRecord.cashAccount;
}

// Returns everything the client needs right after login in one round trip,
// scoped to what the signed-in user is actually allowed to see: unpermitted
// collections come back empty rather than relying on the client to hide them.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { user } = session;
  const allowedKinds = user.isAdmin ? RECORD_KINDS : RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
  const canNotes = user.isAdmin || user.permissions.includes("notes");
  const canReports = user.isAdmin || user.permissions.includes("reportBuilder");
  const canArchive = user.isAdmin || user.permissions.includes("archive");

  const db = getDb();
  const [accessibleIds, accessibleNames, recordRows, archiveRows, noteRows, reportRows, settingsRows, userRows] = await Promise.all([
    accessibleCashAccountIds(user, db),
    accessibleCashAccountNames(user, db),
    allowedKinds.length
      ? db.select().from(records).where(inArray(records.kind, allowedKinds)).orderBy(desc(records.date), desc(records.id))
      : Promise.resolve([]),
    canArchive ? db.select().from(archive).orderBy(desc(archive.at), desc(archive.id)) : Promise.resolve([]),
    canNotes ? db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id)) : Promise.resolve([]),
    canReports ? db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt)) : Promise.resolve([]),
    db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1),
    // Every user gets their own row here even when not admin — Kullanıcılar
    // is open to everyone so they can view/edit their own account, just
    // scoped to themselves (see app/components/Users.tsx).
    user.isAdmin ? db.select().from(users).orderBy(users.id) : db.select().from(users).where(eq(users.id, user.id)).limit(1),
  ]);

  const allowedNames = accessibleNames === null ? null : new Set(accessibleNames);
  const scopedArchive = allowedNames === null
    ? archiveRows
    : archiveRows.filter((row) => {
        const name = kasaNameOf(row.oldRecord as { kind: string; source: string; cashAccount: string });
        return !name || allowedNames.has(name);
      });
  const scopedReports = allowedNames === null
    ? reportRows
    : reportRows.filter((row) => !row.cashAccount || allowedNames.has(row.cashAccount));

  return json({
    records: scopeRecordsToAccessibleKasas(recordRows, accessibleIds),
    archive: scopedArchive.map(toClientArchiveItem),
    notes: noteRows,
    preparedReports: scopedReports,
    settings: settingsRows[0] ?? null,
    users: userRows.map(toClientUser),
  });
});
