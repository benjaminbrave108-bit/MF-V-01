import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { financeNotes, noteColumns, noteComments, noteReads, users } from "../../../db/schema";
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

// ---- Not listesi (istemciye giden biçim) ----------------------------------
// Ekler (base64) liste yanıtında ASLA gönderilmez — 5 sn'lik arka plan
// yenilemesini şişirmesin diye yalnızca dosya adları gider; içerik
// GET /api/notes/:id/attachments/:index ile tıklandığında indirilir.
export async function listClientNotes(userId: number, db: DbClient) {
  const [rows, userRows, commentRows] = await Promise.all([
    db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id)),
    db.select({ id: users.id, name: users.name }).from(users),
    db.select({ noteId: noteComments.noteId, n: sql<number>`count(*)::int` }).from(noteComments).groupBy(noteComments.noteId),
  ]);
  const unreadIds = await unreadNoteIdSet(userId, rows, db);
  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const countByNote = new Map(commentRows.map((c) => [c.noteId, c.n]));
  return rows.map((row) => toClientNote(row, nameById, unreadIds.has(row.id), countByNote.get(row.id) ?? 0));
}

export function toClientNote(
  row: typeof financeNotes.$inferSelect,
  nameById: Map<number, string>,
  isUnread: boolean,
  commentCount: number,
) {
  const { attachments, ...rest } = row;
  return {
    ...rest,
    assignedUserNames: (row.assignedUserIds as number[]).map((id) => nameById.get(id)).filter((name): name is string => Boolean(name)),
    attachmentNames: ((attachments as { name: string }[]) ?? []).map((a) => a.name),
    commentCount,
    isUnread,
  };
}

// Kişi adlarını kırpar ve büyük/küçük harf duyarsız tekilleştirir (ilk yazılış korunur).
export function dedupePeople(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLocaleLowerCase("tr");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Yalnızca atanmış kullanıcılar ve yöneticiler nota mesaj yazabilir.
export function canPostNoteComment(
  user: { id: number; isAdmin: boolean; isSuperAdmin: boolean },
  note: { assignedUserIds: unknown },
): boolean {
  return user.isAdmin || user.isSuperAdmin || (note.assignedUserIds as number[]).includes(user.id);
}

// Bilinmeyen / silinmiş bir sütun anahtarı gelirse notu ilk sütuna koyar.
export async function resolveNoteStatus(status: string, db: DbClient): Promise<string> {
  const cols = await db.select({ key: noteColumns.key }).from(noteColumns).orderBy(noteColumns.sortOrder, noteColumns.id);
  if (cols.some((c) => c.key === status)) return status;
  return cols[0]?.key ?? status;
}
