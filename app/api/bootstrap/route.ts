import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { archive, financeNotes, preparedReports, records, settings, users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json } from "../_lib/http";
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
    permissions: row.permissions,
    locked: row.locked,
    lockedAt: row.lockedAt,
    lockReason: row.lockReason,
  };
}

// Returns everything the client needs right after login in one round trip,
// scoped to what the signed-in user is actually allowed to see: unpermitted
// collections come back empty rather than relying on the client to hide them.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { user } = session;
  const allowedKinds = user.isAdmin ? RECORD_KINDS : RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
  const canNotes = user.isAdmin || user.permissions.includes("notes");
  const canReports = user.isAdmin || user.permissions.includes("reportBuilder");
  const canArchive = user.isAdmin || user.permissions.includes("archive");

  const db = getDb();
  const [recordRows, archiveRows, noteRows, reportRows, settingsRows, userRows] = await Promise.all([
    allowedKinds.length
      ? db.select().from(records).where(inArray(records.kind, allowedKinds)).orderBy(desc(records.date), desc(records.id))
      : Promise.resolve([]),
    canArchive ? db.select().from(archive).orderBy(desc(archive.at), desc(archive.id)) : Promise.resolve([]),
    canNotes ? db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id)) : Promise.resolve([]),
    canReports ? db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt)) : Promise.resolve([]),
    db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1),
    user.isAdmin ? db.select().from(users).orderBy(users.id) : Promise.resolve([]),
  ]);

  return json({
    records: recordRows,
    archive: archiveRows.map(toClientArchiveItem),
    notes: noteRows,
    preparedReports: reportRows,
    settings: settingsRows[0] ?? null,
    users: user.isAdmin ? userRows.map(toClientUser) : undefined,
  });
}
