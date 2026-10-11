import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { listDistributions, listMembers } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildListDetails, loadListForUser } from "../../../_lib/lists";
import { distributionInputSchema, parseBody } from "../../../_lib/validate";

export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, distributionInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;
  const [member] = await db
    .select()
    .from(listMembers)
    .where(and(eq(listMembers.id, payload.memberId), eq(listMembers.listId, id)))
    .limit(1);
  if (!member) return json({ error: "Kişi bu listede yok" }, { status: 400 });

  await db.insert(listDistributions).values({ listId: id, memberId: payload.memberId, amount: payload.amount, date: payload.date, note: payload.note });
  const [detail] = await buildListDetails([id], session.user, db);
  return json({ list: detail }, { status: 201 });
});
