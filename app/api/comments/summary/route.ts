import { asc, inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { recordComments, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { canAccessRecord } from "../../_lib/records";
import { json, withErrorHandling } from "../../_lib/http";

// Lightweight per-record comment summary (count + last comment) for a batch
// of record ids — lets Kasalar/Gelir/Gider show a hover preview on the 💬
// icon without opening the full thread modal or issuing one request per row.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (!ids.length) return json({ summaries: {} });

  const db = getDb();
  const recordRows = await db.select().from(records).where(inArray(records.id, ids));
  const allowedIds = new Set<number>();
  for (const record of recordRows) {
    if (await canAccessRecord(session.user, record, db)) allowedIds.add(record.id);
  }
  if (!allowedIds.size) return json({ summaries: {} });

  const commentRows = await db
    .select()
    .from(recordComments)
    .where(inArray(recordComments.recordId, [...allowedIds]))
    .orderBy(asc(recordComments.createdAt), asc(recordComments.id));

  const summaries: Record<
    number,
    { count: number; lastText: string; lastUserName: string; lastCreatedAt: string; hasAttention: boolean }
  > = {};
  for (const comment of commentRows) {
    const existing = summaries[comment.recordId];
    summaries[comment.recordId] = {
      count: (existing?.count ?? 0) + 1,
      lastText: comment.text,
      lastUserName: comment.userName,
      lastCreatedAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
      hasAttention: (existing?.hasAttention ?? false) || comment.isAttention,
    };
  }

  return json({ summaries });
});
