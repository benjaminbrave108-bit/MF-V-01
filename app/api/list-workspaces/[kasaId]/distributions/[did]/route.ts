import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { workspaceDistributions } from "../../../../../../db/schema";
import { requireSession } from "../../../../_lib/auth";
import { json, withErrorHandling } from "../../../../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../../../../_lib/lists";

export const DELETE = withErrorHandling<{ params: Promise<{ kasaId: string; did: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const { kasaId: k, did: d } = await params;
  const kasaId = Number(k);
  const did = Number(d);
  if (!Number.isFinite(kasaId) || !Number.isFinite(did)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  await db.delete(workspaceDistributions).where(and(eq(workspaceDistributions.id, did), eq(workspaceDistributions.cashAccountId, kasaId)));
  const [workspace] = await buildWorkspaces(session.user, [kasaId], db);
  return json({ workspace });
});
