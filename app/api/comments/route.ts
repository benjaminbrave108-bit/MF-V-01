import { asc, desc, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { recordComments, records } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { accessibleCashAccountIds } from "../_lib/cash-access";
import { reactionsByCommentId } from "../_lib/comments";
import { json, withErrorHandling } from "../_lib/http";
import type { Kind } from "../_lib/types";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

// Mali Özel Notlar > Yorumlar: every record (Kasalar/Gelir/Gider row) the
// caller can see that has at least one comment, each with its full thread —
// same visibility rule as GET /api/records (kind permission + kasa access),
// so a thread never surfaces a record the caller couldn't otherwise open.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "comments");
  if ("response" in session) return session.response;

  const allowed = allowedKinds(session.user);
  if (!allowed.length) return json({ threads: [] });

  const db = getDb();
  const accessibleIds = await accessibleCashAccountIds(session.user, db);

  const [recordRows, commentRows] = await Promise.all([
    db.select().from(records).where(inArray(records.kind, allowed)).orderBy(desc(records.date), desc(records.id)),
    db.select().from(recordComments).orderBy(asc(recordComments.createdAt), asc(recordComments.id)),
  ]);

  const allowedRecordIds = new Set(
    recordRows
      .filter((r) => accessibleIds === null || r.cashAccountId === null || accessibleIds.includes(r.cashAccountId))
      .map((r) => r.id),
  );

  const commentsByRecordId = new Map<number, typeof commentRows>();
  for (const comment of commentRows) {
    if (!allowedRecordIds.has(comment.recordId)) continue;
    const list = commentsByRecordId.get(comment.recordId) ?? [];
    list.push(comment);
    commentsByRecordId.set(comment.recordId, list);
  }

  const visibleCommentIds = commentRows.filter((c) => allowedRecordIds.has(c.recordId)).map((c) => c.id);
  const reactions = await reactionsByCommentId(visibleCommentIds, session.user.id, db);

  const threads = recordRows
    .filter((r) => commentsByRecordId.has(r.id))
    .map((record) => ({
      record,
      comments: commentsByRecordId.get(record.id)!.map((c) => ({ ...c, reactions: reactions.get(c.id) ?? [] })),
    }))
    .sort((a, b) => {
      const aLast = new Date(a.comments[a.comments.length - 1].createdAt).getTime();
      const bLast = new Date(b.comments[b.comments.length - 1].createdAt).getTime();
      return bLast - aLast;
    });

  return json({ threads });
});
