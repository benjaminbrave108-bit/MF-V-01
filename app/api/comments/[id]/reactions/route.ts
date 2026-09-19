import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { commentReactions, recordComments, records } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { canAccessRecord } from "../../../_lib/records";
import { reactionsByCommentId } from "../../../_lib/comments";
import { json, withErrorHandling } from "../../../_lib/http";
import { parseBody, reactionInputSchema } from "../../../_lib/validate";

// Toggles the current user's emoji reaction on one comment: reacted already
// → remove it, not yet → add it. Same visibility rule as the comment itself
// (canAccessRecord on the record it belongs to) — reacting needs nothing
// more than being able to read the thread.
export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const commentId = Number(idParam);
  if (!Number.isFinite(commentId)) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, reactionInputSchema);
  if ("response" in parsed) return parsed.response;
  const { emoji } = parsed.data;

  const db = getDb();
  const commentRows = await db.select().from(recordComments).where(eq(recordComments.id, commentId)).limit(1);
  const comment = commentRows[0];
  if (!comment) return json({ error: "Comment not found" }, { status: 404 });

  const recordRows = await db.select().from(records).where(eq(records.id, comment.recordId)).limit(1);
  const record = recordRows[0];
  if (!record || !(await canAccessRecord(session.user, record, db))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await db
    .select()
    .from(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, commentId),
        eq(commentReactions.userId, session.user.id),
        eq(commentReactions.emoji, emoji),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .delete(commentReactions)
      .where(
        and(
          eq(commentReactions.commentId, commentId),
          eq(commentReactions.userId, session.user.id),
          eq(commentReactions.emoji, emoji),
        ),
      );
  } else {
    await db.insert(commentReactions).values({ commentId, userId: session.user.id, emoji }).onConflictDoNothing();
  }

  const reactions = await reactionsByCommentId([commentId], session.user.id, db);
  return json({ reactions: reactions.get(commentId) ?? [] });
});
