import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { workspaceRecipients } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../../../_lib/lists";
import { parseBody, recipientInputSchema } from "../../../_lib/validate";

export const POST = withErrorHandling<{ params: Promise<{ kasaId: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const kasaId = Number((await params).kasaId);
  if (!Number.isFinite(kasaId)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, recipientInputSchema);
  if ("response" in parsed) return parsed.response;

  const existing = await db
    .select({ id: workspaceRecipients.id })
    .from(workspaceRecipients)
    .where(and(eq(workspaceRecipients.cashAccountId, kasaId), eq(workspaceRecipients.name, parsed.data.name)))
    .limit(1);
  if (existing.length) return json({ error: "Bu alıcı zaten var" }, { status: 409 });
  await db.insert(workspaceRecipients).values({ cashAccountId: kasaId, name: parsed.data.name });
  const [workspace] = await buildWorkspaces(session.user, [kasaId], db);
  return json({ workspace }, { status: 201 });
});
