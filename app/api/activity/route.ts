import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../../db";
import { activityLog } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";

// Son İşlemler: kullanıcıların yaptığı işlemlerin günlüğü. Yönetici herkesinkini görür; yetkili diğer kullanıcılar yalnızca kendi işlemlerini.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "activity");
  if ("response" in session) return session.response;

  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const userId = Number(params.get("userId") ?? "");
  const category = params.get("category") ?? "";
  const workspace = params.get("workspace") ?? "";
  const q = (params.get("q") ?? "").trim();
  const limit = Math.min(1000, Math.max(10, Number(params.get("limit")) || 100));

  const base: SQL[] = [];
  if (!session.user.isAdmin) base.push(eq(activityLog.userId, session.user.id));
  else if (Number.isInteger(userId) && userId > 0) base.push(eq(activityLog.userId, userId));
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) base.push(gte(activityLog.at, new Date(`${from}T00:00:00`)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    base.push(lt(activityLog.at, end));
  }
  if (workspace) base.push(eq(activityLog.workspace, workspace));
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    base.push(or(ilike(activityLog.summary, like), ilike(activityLog.kasa, like), ilike(activityLog.userName, like))!);
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(activityLog)
    .where(and(...base, ...(category ? [eq(activityLog.category, category)] : [])))
    .orderBy(desc(activityLog.at), desc(activityLog.id))
    .limit(limit);

  const countRows = await db
    .select({ category: activityLog.category, n: sql<number>`count(*)::int` })
    .from(activityLog)
    .where(and(...base))
    .groupBy(activityLog.category);
  const counts: Record<string, number> = {};
  for (const c of countRows) counts[c.category] = c.n;

  const userScope = session.user.isAdmin ? undefined : eq(activityLog.userId, session.user.id);
  const userRows = await db.selectDistinct({ id: activityLog.userId, name: activityLog.userName }).from(activityLog).where(userScope);
  const workspaceRows = await db.selectDistinct({ name: activityLog.workspace }).from(activityLog).where(userScope);

  return json({
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      userId: r.userId,
      userName: r.userName,
      category: r.category,
      action: r.action,
      summary: r.summary,
      kasa: r.kasa,
      workspace: r.workspace,
    })),
    counts,
    users: userRows.filter((u) => u.id != null),
    workspaces: workspaceRows.map((w) => w.name).filter(Boolean).sort(),
  });
});
