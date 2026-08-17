import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { createSession, sessionCookieHeader } from "../../_lib/auth";
import type { Page } from "../../_lib/types";

export async function POST(request: Request) {
  let payload: { username?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";
  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    return Response.json({ error: "Incorrect username or password" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(account.id);

  return Response.json(
    {
      profile: {
        name: account.name,
        username: account.username,
        role: account.roleLabel,
        isAdmin: account.isAdmin,
        permissions: (account.permissions as Page[]) ?? [],
        avatar: account.avatar,
      },
    },
    { status: 200, headers: { "Set-Cookie": sessionCookieHeader(token, expiresAt) } },
  );
}
