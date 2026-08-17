import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { createSession, sessionCookieHeader } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { clearAttempts, getClientIp, isRateLimited, recordFailedAttempt } from "../../_lib/rate-limit";
import type { Page } from "../../_lib/types";

export async function POST(request: Request) {
  let payload: { username?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";
  if (!username || !password) {
    return json({ error: "Username and password are required" }, { status: 400 });
  }

  const rateLimitKey = `login:${getClientIp(request)}:${username.toLowerCase()}`;
  const retryAfter = isRateLimited(rateLimitKey);
  if (retryAfter !== null) {
    return json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const account = rows[0];
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    recordFailedAttempt(rateLimitKey);
    return json({ error: "Incorrect username or password" }, { status: 401 });
  }
  clearAttempts(rateLimitKey);

  const { token, expiresAt } = await createSession(account.id);

  return json(
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
