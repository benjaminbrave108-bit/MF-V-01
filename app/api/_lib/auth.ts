import { and, desc, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { sessions, users } from "../../../db/schema";
import type { Page } from "./types";

const COOKIE_NAME = "mfv01_session";
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const SECURE = process.env.SESSION_COOKIE_SECURE !== "false";
// Caps session rows per user (a stolen/never-logged-out token has a natural
// expiry via TTL, but nothing else was bounding how many could pile up).
const MAX_SESSIONS_PER_USER = 10;

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: Page[];
  avatar: string;
};

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookieHeader(token: string, expiresAt: Date): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(): string {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (SECURE) parts.push("Secure");
  return parts.join("; ");
}

export function getSessionToken(request: Request): string | null {
  return parseCookies(request.headers.get("cookie")) [COOKIE_NAME] ?? null;
}

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const db = getDb();
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: token, userId, expiresAt });

  // Opportunistic cleanup on the path that actually grows the table: drop
  // this user's already-expired sessions, then trim down to the N most
  // recent if logins have piled up beyond that.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  const remaining = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
  if (remaining.length > MAX_SESSIONS_PER_USER) {
    const staleIds = remaining.slice(MAX_SESSIONS_PER_USER).map((row) => row.id);
    await db.delete(sessions).where(inArray(sessions.id, staleIds));
  }

  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, token));
}

// Invalidates every other session for this user (e.g. after a password
// change) so a stolen/leftover token elsewhere stops working immediately.
export async function destroyOtherSessions(userId: number, exceptToken: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, exceptToken)));
}

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roleLabel: user.roleLabel,
    isAdmin: user.isAdmin,
    permissions: (user.permissions as Page[]) ?? [],
    avatar: user.avatar,
  };
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  return row ? toSessionUser(row.user) : null;
}

export async function requireSession(request: Request): Promise<{ user: SessionUser } | { response: Response }> {
  const user = await getSessionUser(request);
  if (!user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user };
}

export async function requireAdmin(request: Request): Promise<{ user: SessionUser } | { response: Response }> {
  const result = await requireSession(request);
  if ("response" in result) return result;
  if (!result.user.isAdmin) return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return result;
}

// Admins implicitly have every page's access; non-admins need the page in
// their `permissions` list. Mirrors the client-side `canAccess` gate in
// app/page.tsx, but this is the copy that actually matters — the client
// check only hides menu items, it can't stop a direct API request.
export async function requirePermission(request: Request, page: Page): Promise<{ user: SessionUser } | { response: Response }> {
  const result = await requireSession(request);
  if ("response" in result) return result;
  if (result.user.isAdmin || result.user.permissions.includes(page)) return result;
  return { response: Response.json({ error: "Forbidden" }, { status: 403 }) };
}
