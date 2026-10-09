import { inArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { commentThreadArchives, recordComments, records } from "../../../../db/schema";
import { requirePermission } from "../../_lib/auth";
import { accessibleCashAccountIds } from "../../_lib/cash-access";
import { json, withErrorHandling } from "../../_lib/http";
import type { Kind } from "../../_lib/types";

const RECORD_KINDS: Kind[] = ["cash", "income", "expense"];

function allowedKinds(user: { isAdmin: boolean; permissions: string[] }): Kind[] {
  if (user.isAdmin) return RECORD_KINDS;
  return RECORD_KINDS.filter((kind) => user.permissions.includes(kind));
}

// Arşiv > Yorumlar Arşivi — one summary row per archived thread (not the
// full comment history, this is a browse list, not the thread itself).
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "archive");
  if ("response" in session) return session.response;

  const allowed = allowedKinds(session.user);
  if (!allowed.length) return json({ threads: [] });

  const db = getDb();
  const accessibleIds = await accessibleCashAccountIds(session.user, db);

  const archivedRows = await db.select().from(commentThreadArchives);
  if (!archivedRows.length) return json({ threads: [] });

  const archivedRecordIds = archivedRows.map((r) => r.recordId);
  const [recordRows, commentRows] = await Promise.all([
    db.select().from(records).where(inArray(records.id, archivedRecordIds)),
    db.select().from(recordComments).where(inArray(recordComments.recordId, archivedRecordIds)),
  ]);

  const recordById = new Map(recordRows.map((r) => [r.id, r]));
  const commentsByRecordId = new Map<number, typeof commentRows>();
  for (const c of commentRows) {
    const list = commentsByRecordId.get(c.recordId) ?? [];
    list.push(c);
    commentsByRecordId.set(c.recordId, list);
  }

  const threads = archivedRows
    .map((archived) => {
      const record = recordById.get(archived.recordId);
      if (!record) return null;
      if (!allowed.includes(record.kind as Kind)) return null;
      if (accessibleIds !== null && record.cashAccountId !== null && !accessibleIds.includes(record.cashAccountId)) return null;
      const comments = (commentsByRecordId.get(archived.recordId) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const last = comments[comments.length - 1];
      return {
        recordId: archived.recordId,
        recordSource: record.source,
        recordKind: record.kind,
        commentCount: comments.length,
        lastText: last?.text ?? "",
        lastUserName: last?.userName ?? "",
        lastCreatedAt: last?.createdAt ?? archived.archivedAt,
        archivedByName: archived.archivedByName,
        archivedAt: archived.archivedAt,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());

  return json({ threads });
});
