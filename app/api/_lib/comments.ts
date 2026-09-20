import { and, eq, inArray } from "drizzle-orm";
import { commentReactions, commentReads, recordComments, records } from "../../../db/schema";
import type { DbClient } from "../../../db";
import { accessibleCashAccountIds } from "./cash-access";
import type { SessionUser } from "./auth";
import type { Kind } from "./types";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

// Groups comment_reactions rows into per-comment {emoji, count, mine}[] —
// shared by every place that returns comments (both comment list endpoints)
// and by the reaction-toggle endpoint's response, so all three render the
// exact same shape.
export async function reactionsByCommentId(
  commentIds: number[],
  currentUserId: number,
  db: DbClient,
): Promise<Map<number, ReactionSummary[]>> {
  const result = new Map<number, ReactionSummary[]>();
  if (!commentIds.length) return result;

  const rows = await db.select().from(commentReactions).where(inArray(commentReactions.commentId, commentIds));
  const grouped = new Map<number, Map<string, ReactionSummary>>();
  for (const row of rows) {
    const byEmoji = grouped.get(row.commentId) ?? new Map<string, ReactionSummary>();
    const entry = byEmoji.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false };
    entry.count += 1;
    if (row.userId === currentUserId) entry.mine = true;
    byEmoji.set(row.emoji, entry);
    grouped.set(row.commentId, byEmoji);
  }
  for (const [commentId, byEmoji] of grouped) {
    result.set(commentId, [...byEmoji.values()]);
  }
  return result;
}

// Every record id `user` can see (kind permission + kasa access, same rule
// as GET /api/records) that has at least one comment — the universe both
// unreadCommentCount and markAllCommentsRead operate over.
async function accessibleCommentedRecordIds(
  user: Pick<SessionUser, "isAdmin" | "isSuperAdmin" | "permissions">,
  db: DbClient,
): Promise<number[]> {
  const allowed = allowedKinds(user);
  if (!allowed.length) return [];

  const [recordRows, commentedIdRows] = await Promise.all([
    db.select({ id: records.id, cashAccountId: records.cashAccountId }).from(records).where(inArray(records.kind, allowed)),
    db.selectDistinct({ recordId: recordComments.recordId }).from(recordComments),
  ]);

  const accessibleIds = await accessibleCashAccountIds(user as Pick<SessionUser, "id" | "isSuperAdmin">, db);
  const commentedIds = new Set(commentedIdRows.map((r) => r.recordId));
  return recordRows
    .filter((r) => commentedIds.has(r.id))
    .filter((r) => accessibleIds === null || r.cashAccountId === null || accessibleIds.includes(r.cashAccountId))
    .map((r) => r.id);
}

// Per-record "does this thread have a comment `userId` hasn't seen yet"
// flag — newer than that record's read marker (or never read at all),
// written by anyone but `userId` themself (you don't need to be told about
// your own comment). Shared by the unread badge count, the Yorumlar list's
// per-thread indicator, and the 💬 summary's per-row indicator, so all three
// agree on exactly the same definition of "unread".
export async function unreadRecordIds(
  userId: number,
  recordIds: number[],
  db: DbClient,
): Promise<Set<number>> {
  const result = new Set<number>();
  if (!recordIds.length) return result;

  const [commentRows, readRows] = await Promise.all([
    db
      .select({ recordId: recordComments.recordId, userId: recordComments.userId, createdAt: recordComments.createdAt })
      .from(recordComments)
      .where(inArray(recordComments.recordId, recordIds)),
    db.select().from(commentReads).where(and(eq(commentReads.userId, userId), inArray(commentReads.recordId, recordIds))),
  ]);

  const lastReadByRecordId = new Map(readRows.map((r) => [r.recordId, new Date(r.lastReadAt).getTime()]));
  for (const comment of commentRows) {
    if (comment.userId === userId) continue;
    const lastRead = lastReadByRecordId.get(comment.recordId);
    if (lastRead === undefined || new Date(comment.createdAt).getTime() > lastRead) result.add(comment.recordId);
  }
  return result;
}

// Sidebar "Yorumlar" badge count — same "unread" definition as
// unreadRecordIds, just counting matching comments instead of distinct
// records.
export async function unreadCommentCount(
  user: Pick<SessionUser, "id" | "isAdmin" | "isSuperAdmin" | "permissions">,
  db: DbClient,
): Promise<number> {
  const recordIds = await accessibleCommentedRecordIds(user, db);
  if (!recordIds.length) return 0;

  const [commentRows, readRows] = await Promise.all([
    db
      .select({ recordId: recordComments.recordId, userId: recordComments.userId, createdAt: recordComments.createdAt })
      .from(recordComments)
      .where(inArray(recordComments.recordId, recordIds)),
    db.select().from(commentReads).where(and(eq(commentReads.userId, user.id), inArray(commentReads.recordId, recordIds))),
  ]);

  const lastReadByRecordId = new Map(readRows.map((r) => [r.recordId, new Date(r.lastReadAt).getTime()]));
  let count = 0;
  for (const comment of commentRows) {
    if (comment.userId === user.id) continue;
    const lastRead = lastReadByRecordId.get(comment.recordId);
    if (lastRead === undefined || new Date(comment.createdAt).getTime() > lastRead) count += 1;
  }
  return count;
}

// Upserts this user's read marker for one record's thread to now — called
// whenever they open it (RecordCommentsModal, or a card on Yorumlar).
export async function markCommentRead(userId: number, recordId: number, db: DbClient): Promise<void> {
  await db
    .insert(commentReads)
    .values({ userId, recordId })
    .onConflictDoUpdate({ target: [commentReads.userId, commentReads.recordId], set: { lastReadAt: new Date() } });
}

// Same, but for every commented record `user` can see at once — called when
// the Yorumlar page itself loads (viewing the list reads everything on it).
export async function markAllCommentsRead(
  user: Pick<SessionUser, "id" | "isAdmin" | "isSuperAdmin" | "permissions">,
  db: DbClient,
): Promise<void> {
  const recordIds = await accessibleCommentedRecordIds(user, db);
  if (!recordIds.length) return;
  const now = new Date();
  await db
    .insert(commentReads)
    .values(recordIds.map((recordId) => ({ userId: user.id, recordId, lastReadAt: now })))
    .onConflictDoUpdate({ target: [commentReads.userId, commentReads.recordId], set: { lastReadAt: now } });
}
