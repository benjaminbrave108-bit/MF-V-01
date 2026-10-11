import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { workspaceDistributions, workspaceRecipients } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../../../_lib/lists";
import { parseBody, workspaceDistributionSchema } from "../../../_lib/validate";

// Çalışma alanı kasasından bir alıcıya dağıtım ekler.
export const POST = withErrorHandling<{ params: Promise<{ kasaId: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const kasaId = Number((await params).kasaId);
  if (!Number.isFinite(kasaId)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, workspaceDistributionSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const [recipient] = await db
    .select({ id: workspaceRecipients.id })
    .from(workspaceRecipients)
    .where(and(eq(workspaceRecipients.id, payload.recipientId), eq(workspaceRecipients.cashAccountId, kasaId)))
    .limit(1);
  if (!recipient) return json({ error: "Alıcı bu çalışma alanında yok" }, { status: 400 });

  await db.insert(workspaceDistributions).values({ cashAccountId: kasaId, recipientId: payload.recipientId, amount: payload.amount, date: payload.date, note: payload.note });
  const [workspace] = await buildWorkspaces(session.user, [kasaId], db);
  return json({ workspace }, { status: 201 });
});
