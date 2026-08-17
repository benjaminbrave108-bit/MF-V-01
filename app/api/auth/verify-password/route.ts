import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "../../_lib/rate-limit";

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const rateLimitKey = `verify-password:${session.user.id}`;
  const retryAfter = isRateLimited(rateLimitKey);
  if (retryAfter !== null) {
    return json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let payload: { password?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const password = payload.password ?? "";

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const account = rows[0];
  const valid = Boolean(account) && (await verifyPassword(password, account.passwordHash));
  if (valid) clearAttempts(rateLimitKey);
  else recordFailedAttempt(rateLimitKey);
  return json({ valid });
});
