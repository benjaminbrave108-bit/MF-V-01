import { and, eq, inArray } from "drizzle-orm";
import { financeNotes, noteReads } from "../../../db/schema";
import type { DbClient } from "../../../db";

// Same "read up to" idea as commentReads, but per-note instead of
// per-record-thread: a note counts as unread for a user until they open
// the Notlar page (or the note itself), and goes unread again if it's
// edited afterwards (updatedAt moves past their read marker).
async function readMarkers(userId: number, noteIds: number[], db: DbClient): Promise<Map<number, number>> {
  if (!noteIds.length) return new Map();
  const rows = await db
    .select()
    .from(noteReads)
    .where(and(eq(noteReads.userId, userId), inArray(noteReads.noteId, noteIds)));
  return new Map(rows.map((r) => [r.noteId, new Date(r.lastReadAt).getTime()]));
}

// Archived notes are deliberately excluded from "unread" everywhere — once
// a note is archived it's out of the active flow, so it shouldn't keep
// nagging the badge/list (bkz. Notes.tsx "Arşivle").
export async function unreadNoteCount(userId: number, db: DbClient): Promise<number> {
  const rows = await db
    .select({ id: financeNotes.id, updatedAt: financeNotes.updatedAt })
    .from(financeNotes)
    .where(eq(financeNotes.isArchived, false));
  if (!rows.length) return 0;
  const markers = await readMarkers(userId, rows.map((r) => r.id), db);
  let count = 0;
  for (const row of rows) {
    const lastRead = markers.get(row.id);
    if (lastRead === undefined || new Date(row.updatedAt).getTime() > lastRead) count += 1;
  }
  return count;
}

// Per-note unread flags for the GET /api/notes list — same rule as above,
// applied to whatever rows the caller already fetched.
export async function unreadNoteIdSet(
  userId: number,
  rows: { id: number; updatedAt: Date | string }[],
  db: DbClient,
): Promise<Set<number>> {
  const markers = await readMarkers(userId, rows.map((r) => r.id), db);
  const result = new Set<number>();
  for (const row of rows) {
    const lastRead = markers.get(row.id);
    if (lastRead === undefined || new Date(row.updatedAt).getTime() > lastRead) result.add(row.id);
  }
  return result;
}

// Marks every (non-archived) note read for `userId` — called when the
// Notlar page itself loads, same convention as markAllCommentsRead.
export async function markAllNotesRead(userId: number, db: DbClient): Promise<void> {
  const rows = await db.select({ id: financeNotes.id }).from(financeNotes).where(eq(financeNotes.isArchived, false));
  if (!rows.length) return;
  const now = new Date();
  await db
    .insert(noteReads)
    .values(rows.map((r) => ({ userId, noteId: r.id, lastReadAt: now })))
    .onConflictDoUpdate({ target: [noteReads.userId, noteReads.noteId], set: { lastReadAt: now } });
}
