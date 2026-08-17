import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { hashPassword, validatePasswordPolicy } from "../../../db/passwords";
import { requireAdmin } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody, userCreateSchema } from "../_lib/validate";

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

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(users).orderBy(users.id);
  return json({ users: rows.map(toClientUser) });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, userCreateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;
  const username = payload.username.trim();
  if (!username) return json({ error: "Username and password are required" }, { status: 400 });

  const policyError = validatePasswordPolicy(payload.password, username);
  if (policyError) return json({ error: policyError }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing[0]) return json({ error: "Username already exists" }, { status: 409 });

  const [account] = await db
    .insert(users)
    .values({
      username,
      passwordHash: await hashPassword(payload.password),
      name: payload.name || username,
      roleLabel: payload.roleLabel,
      isAdmin: payload.isAdmin,
      permissions: payload.isAdmin ? [] : payload.permissions,
    })
    .returning();

  return json({ user: toClientUser(account) }, { status: 201 });
});
