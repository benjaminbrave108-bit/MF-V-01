import { getDb } from "../../../db";
import { listWorkspaces } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../_lib/lists";
import { parseBody, workspaceInputSchema } from "../_lib/validate";

// Yeni çalışma alanı: bir kasa seçilir (kasa başına tek çalışma alanı), isteğe bağlı ad, tutar ve not girilir.
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin && !session.user.permissions.includes("lists")) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, workspaceInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const access = await workspaceAccess(payload.cashAccountId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const inserted = await db
    .insert(listWorkspaces)
    .values({ cashAccountId: payload.cashAccountId, name: payload.name.trim(), amount: payload.amount, note: payload.note.trim() })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return json({ error: "Bu kasa için zaten bir çalışma alanı var" }, { status: 409 });
  const [workspace] = await buildWorkspaces(session.user, [payload.cashAccountId], db);
  return json({ workspace }, { status: 201 });
});
