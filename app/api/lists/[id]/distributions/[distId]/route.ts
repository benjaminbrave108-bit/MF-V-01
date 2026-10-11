import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { listDistributions } from "../../../../../../db/schema";
import { requireSession } from "../../../../_lib/auth";
import { json, withErrorHandling } from "../../../../_lib/http";
import { buildListDetails, loadListForUser } from "../../../../_lib/lists";

export const DELETE = withErrorHandling<{ params: Promise<{ id: string; distId: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const { id: idParam, distId: distParam } = await params;
  const id = Number(idParam);
  const distId = Number(distParam);
  if (!Number.isFinite(id) || !Number.isFinite(distId)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  await db.delete(listDistributions).where(and(eq(listDistributions.id, distId), eq(listDistributions.listId, id)));
  const [detail] = await buildListDetails([id], session.user, db);
  return json({ list: detail });
});
