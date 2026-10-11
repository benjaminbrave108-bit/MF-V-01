import { getDb } from "../../../../../db";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildWorkspaces, loadListForUser, writeAllocations } from "../../../_lib/lists";
import { listAllocationsInputSchema, parseBody } from "../../../_lib/validate";

// Listenin alıcı dağılımını değiştirir (çalışma alanı tablosundaki hücre düzenlemesi).
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });
  if (list.status === "closed") return json({ error: "Liste kapalı; dağılım değiştirilemez. Önce listeyi yeniden açın." }, { status: 409 });

  const parsed = await parseBody(request, listAllocationsInputSchema);
  if ("response" in parsed) return parsed.response;

  let allocationError: string | null = null;
  try {
    await db.transaction(async (tx) => {
      allocationError = await writeAllocations(tx, list, list.amount, parsed.data.allocations);
      if (allocationError) tx.rollback();
    });
  } catch (error) {
    if (allocationError) return json({ error: allocationError }, { status: 400 });
    throw error;
  }
  const [workspace] = await buildWorkspaces(session.user, [list.cashAccountId!], db);
  return json({ workspace });
});
