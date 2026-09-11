import { and, count, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { hashPassword, validatePasswordPolicy } from "../../../../db/passwords";
import { requireAdmin, requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { parseBody, userUpdateSchema } from "../../_lib/validate";

function toClientUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    roleLabel: row.roleLabel,
    isAdmin: row.isAdmin,
    isSuperAdmin: row.isSuperAdmin,
    permissions: row.permissions,
    locked: row.locked,
    lockedAt: row.lockedAt,
    lockReason: row.lockReason,
  };
}

export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  // Non-admins may only ever edit their own account, and only their name
  // and password — see the isSelfEdit branches below, which pin every
  // other field (role, admin/super-admin flags, permissions) to its
  // existing value regardless of what the request body asks for.
  const isSelfEdit = !session.user.isAdmin;
  if (isSelfEdit && id !== session.user.id) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseBody(request, userUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const existingRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return json({ error: "User not found" }, { status: 404 });

  // Same rule as create: a super-admin flag only sticks if the requester is
  // themself a super admin. A plain admin editing their own or someone
  // else's account silently can't grant (or, below, can't revoke) it.
  const requestedSuperAdmin = isSelfEdit ? existing.isSuperAdmin : (session.user.isSuperAdmin ? payload.isSuperAdmin : existing.isSuperAdmin);
  const isAdmin = isSelfEdit ? existing.isAdmin : (payload.isAdmin || requestedSuperAdmin);
  const isSuperAdmin = requestedSuperAdmin;

  if (existing.isAdmin && !isAdmin) {
    const [{ value: adminCount }] = await db.select({ value: count() }).from(users).where(and(eq(users.isAdmin, true), ne(users.id, id)));
    if (adminCount === 0) {
      return json({ error: "At least one admin account must remain" }, { status: 400 });
    }
  }
  if (existing.isSuperAdmin && !isSuperAdmin) {
    const [{ value: superAdminCount }] = await db.select({ value: count() }).from(users).where(and(eq(users.isSuperAdmin, true), ne(users.id, id)));
    if (superAdminCount === 0) {
      return json({ error: "At least one super admin account must remain" }, { status: 400 });
    }
  }

  const password = payload.password.trim();
  if (password) {
    const policyError = validatePasswordPolicy(password, existing.username);
    if (policyError) return json({ error: policyError }, { status: 400 });
  }
  const [account] = await db
    .update(users)
    .set({
      name: payload.name ?? existing.name,
      roleLabel: isSelfEdit ? existing.roleLabel : (payload.roleLabel ?? existing.roleLabel),
      isAdmin,
      isSuperAdmin,
      permissions: isSelfEdit ? existing.permissions : (isAdmin ? [] : payload.permissions),
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  return json({ user: toClientUser(account) });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
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
  if (existing.isSuperAdmin) {
    const [{ value: superAdminCount }] = await db.select({ value: count() }).from(users).where(and(eq(users.isSuperAdmin, true), ne(users.id, id)));
    if (superAdminCount === 0) {
      return json({ error: "At least one super admin account must remain" }, { status: 400 });
    }
  }

  await db.delete(users).where(eq(users.id, id));
  return json({ ok: true });
});
