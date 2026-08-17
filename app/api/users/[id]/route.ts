import { and, count, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { hashPassword, validatePasswordPolicy } from "../../../../db/passwords";
import { requireAdmin } from "../../_lib/auth";
import { json } from "../../_lib/http";

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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const existingRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return json({ error: "User not found" }, { status: 404 });

  const isAdmin = Boolean(payload.isAdmin);
  if (existing.isAdmin && !isAdmin) {
    const [{ value: adminCount }] = await db.select({ value: count() }).from(users).where(and(eq(users.isAdmin, true), ne(users.id, id)));
    if (adminCount === 0) {
      return json({ error: "At least one admin account must remain" }, { status: 400 });
    }
  }

  const password = String(payload.password ?? "").trim();
  if (password) {
    const policyError = validatePasswordPolicy(password, String(payload.username ?? existing.username));
    if (policyError) return json({ error: policyError }, { status: 400 });
  }
  const [account] = await db
    .update(users)
    .set({
      name: String(payload.name ?? existing.name),
      roleLabel: String(payload.roleLabel ?? existing.roleLabel),
      isAdmin,
      permissions: isAdmin ? [] : Array.isArray(payload.permissions) ? payload.permissions : [],
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  return json({ user: toClientUser(account) });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  if (id === session.user.id) {
    return json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const db = getDb();
  const existingRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return json({ error: "User not found" }, { status: 404 });

  if (existing.isAdmin) {
    const [{ value: adminCount }] = await db.select({ value: count() }).from(users).where(and(eq(users.isAdmin, true), ne(users.id, id)));
    if (adminCount === 0) {
      return json({ error: "At least one admin account must remain" }, { status: 400 });
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return json({ ok: true });
}
