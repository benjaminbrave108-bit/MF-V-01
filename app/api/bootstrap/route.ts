import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { archive, financeNotes, preparedReports, records, settings, users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { toClientArchiveItem } from "../_lib/archive";

const SETTINGS_ID = 1;

function toClientUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    roleLabel: row.roleLabel,
    isAdmin: row.isAdmin,
    permissions: row.permissions,
  };
}

// Returns everything the client needs right after login in one round trip.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const [recordRows, archiveRows, noteRows, reportRows, settingsRows, userRows] = await Promise.all([
    db.select().from(records).orderBy(desc(records.date), desc(records.id)),
    db.select().from(archive).orderBy(desc(archive.at), desc(archive.id)),
    db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id)),
    db.select().from(preparedReports).orderBy(desc(preparedReports.createdAt)),
    db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).limit(1),
    session.user.isAdmin ? db.select().from(users).orderBy(users.id) : Promise.resolve([]),
  ]);

  return Response.json({
    records: recordRows,
    archive: archiveRows.map(toClientArchiveItem),
    notes: noteRows,
    preparedReports: reportRows,
    settings: settingsRows[0] ?? null,
    users: session.user.isAdmin ? userRows.map(toClientUser) : undefined,
  });
}
