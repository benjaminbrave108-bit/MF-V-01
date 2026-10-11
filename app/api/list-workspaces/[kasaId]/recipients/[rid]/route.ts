import { and, eq } from "drizzle-orm";
import { getDb, type DbClient } from "../../../../../../db";
import { workspaceRecipients } from "../../../../../../db/schema";
import { requireSession, type SessionUser } from "../../../../_lib/auth";
import { json, withErrorHandling } from "../../../../_lib/http";
import { buildWorkspaces, workspaceAccess } from "../../../../_lib/lists";
import { parseBody, recipientInputSchema } from "../../../../_lib/validate";

type Ctx = { params: Promise<{ kasaId: string; rid: string }> };
type Resolved = { ok: true; user: SessionUser; kasaId: number; rid: number; db: DbClient } | { ok: false; response: Response };

async function resolve(request: Request, params: Ctx["params"]): Promise<Resolved> {
  const session = await requireSession(request);
  if ("response" in session) return { ok: false, response: session.response };
  const { kasaId: k, rid: r } = await params;
  const kasaId = Number(k);
  const rid = Number(r);
  if (!Number.isFinite(kasaId) || !Number.isFinite(rid)) return { ok: false, response: json({ error: "Invalid id" }, { status: 400 }) };
  const db = getDb();
  const access = await workspaceAccess(kasaId, session.user, db);
  if (!access.canWrite) return { ok: false, response: json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, user: session.user, kasaId, rid, db };
}

// Alıcıyı yeniden adlandırır.
export const PUT = withErrorHandling<Ctx>(async (request, { params }) => {
  const ctx = await resolve(request, params);
  if (!ctx.ok) return ctx.response;
  const parsed = await parseBody(request, recipientInputSchema);
  if ("response" in parsed) return parsed.response;
  await ctx.db
    .update(workspaceRecipients)
    .set({ name: parsed.data.name })
    .where(and(eq(workspaceRecipients.id, ctx.rid), eq(workspaceRecipients.cashAccountId, ctx.kasaId)));
  const [workspace] = await buildWorkspaces(ctx.user, [ctx.kasaId], ctx.db);
  return json({ workspace });
});

// Alıcıyı siler: dağıtımları da silinir, ürünlerdeki alıcısı boşalır.
export const DELETE = withErrorHandling<Ctx>(async (request, { params }) => {
  const ctx = await resolve(request, params);
  if (!ctx.ok) return ctx.response;
  await ctx.db.delete(workspaceRecipients).where(and(eq(workspaceRecipients.id, ctx.rid), eq(workspaceRecipients.cashAccountId, ctx.kasaId)));
  const [workspace] = await buildWorkspaces(ctx.user, [ctx.kasaId], ctx.db);
  return json({ workspace: workspace ?? null });
});
