import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { hashPassword, validatePasswordPolicy } from "../../../db/passwords";
import { requireAdmin } from "../_lib/auth";
import { json } from "../_lib/http";

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

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(users).orderBy(users.id);
  return json({ users: rows.map(toClientUser) });
}

export async function POST(request: Request) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = String(payload.username ?? "").trim();
  const password = String(payload.password ?? "");
  if (!username || !password) {
    return json({ error: "Username and password are required" }, { status: 400 });
  }
  const policyError = validatePasswordPolicy(password, username);
  if (policyError) return json({ error: policyError }, { status: 400 });

  const db = getDb();
  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing[0]) return json({ error: "Username already exists" }, { status: 409 });

  const [account] = await db
    .insert(users)
    .values({
      username,
      passwordHash: await hashPassword(password),
      name: String(payload.name ?? username),
      roleLabel: String(payload.roleLabel ?? ""),
      isAdmin: Boolean(payload.isAdmin),
      permissions: Boolean(payload.isAdmin) ? [] : Array.isArray(payload.permissions) ? payload.permissions : [],
    })
    .returning();

  return json({ user: toClientUser(account) }, { status: 201 });
}
