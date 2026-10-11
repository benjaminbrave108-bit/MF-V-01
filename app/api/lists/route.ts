import { getDb } from "../../../db";
import { lists } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { buildWorkspaces, workspaceAccess, writableKasas, writeAllocations } from "../_lib/lists";
import { listInputSchema, parseBody } from "../_lib/validate";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
}

function canUseLists(user: { isAdmin: boolean; permissions: string[] }) {
  return user.isAdmin || user.permissions.includes("lists");
}

// Çalışma alanları (listesi/alıcısı olan kasalar) + yeni liste açılabilecek kasalar.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!canUseLists(session.user)) return json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  const [workspaces, kasas] = await Promise.all([buildWorkspaces(session.user, null, db), writableKasas(session.user, db)]);
  return json({ workspaces, kasas });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!canUseLists(session.user)) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, listInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const access = await workspaceAccess(payload.cashAccountId, session.user, db);
  if (!access.canWrite) return json({ error: "Forbidden" }, { status: 403 });
  let allocationError: string | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(lists)
        .values({ cashAccountId: payload.cashAccountId, code: payload.code, name: payload.name, date: payload.date, amount: payload.amount, note: payload.note })
        .returning();
      if (payload.allocations) {
        allocationError = await writeAllocations(tx, created, payload.amount, payload.allocations);
        if (allocationError) tx.rollback();
      }
      return created;
    });
    const [workspace] = await buildWorkspaces(session.user, [payload.cashAccountId], db);
    return json({ workspace, listId: result.id }, { status: 201 });
  } catch (error) {
    if (allocationError) return json({ error: allocationError }, { status: 400 });
    if (isUniqueViolation(error)) return json({ error: "Bu çalışma alanında aynı kodlu bir liste zaten var" }, { status: 409 });
    throw error;
  }
});
