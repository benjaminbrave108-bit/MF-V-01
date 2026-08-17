import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { users } from "../../../../../db/schema";
import { requireAdmin } from "../../../_lib/auth";
import { json } from "../../../_lib/http";
import { unlockUserAccount } from "../../../_lib/security";

function toClientUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    roleLabel: row.roleLabel,
    isAdmin: row.isAdmin,
    permissions: row.permissions,
    locked: row.locked,
    lockedAt: row.lockedAt,
    lockReason: row.lockReason,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  await unlockUserAccount(id);
  const rows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  const account = rows[0];
  if (!account) return json({ error: "User not found" }, { status: 404 });

  return json({ user: toClientUser(account) });
}
