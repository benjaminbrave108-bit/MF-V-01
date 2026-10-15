import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { records } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildWorkspaces, workspaceAccess, writeExpenseAllocations } from "../../../_lib/lists";
import { listAllocationsInputSchema, parseBody } from "../../../_lib/validate";

// Liste kasasındaki bir Gider kaydının alıcılara (kişilere) dağılımını değiştirir; alıcıya yazılan tutar o alıcının
// bu giderdeki harcamasıdır. Çalışma alanındaki güncel veri döner.
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
  if (!record || record.kind !== "expense" || record.cashAccountId == null) return json({ error: "Kayıt bir kasa gideri değil" }, { status: 400 });
  const access = await workspaceAccess(record.cashAccountId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, listAllocationsInputSchema);
  if ("response" in parsed) return parsed.response;

  let allocationError: string | null = null;
  try {
    await db.transaction(async (tx) => {
      allocationError = await writeExpenseAllocations(tx, record, parsed.data.allocations);
      if (allocationError) tx.rollback();
    });
  } catch (error) {
    if (allocationError) return json({ error: allocationError }, { status: 400 });
    throw error;
  }
  const [workspace] = await buildWorkspaces(session.user, [record.cashAccountId], db);
  return json({ workspace });
});
