import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "../../../../db/passwords";
import { destroyOtherSessions, getSessionToken, requireSession } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "../../_lib/rate-limit";

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const rateLimitKey = `profile-password:${session.user.id}`;
  const retryAfter = isRateLimited(rateLimitKey);
  if (retryAfter !== null) {
    return json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  let payload: { currentPassword?: string; newPassword?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const currentPassword = payload.currentPassword ?? "";
  const newPassword = payload.newPassword ?? "";

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const account = rows[0];
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
    recordFailedAttempt(rateLimitKey);
    return json({ error: "Mevcut şifre yanlış" }, { status: 400 });
  }
  clearAttempts(rateLimitKey);

  const policyError = validatePasswordPolicy(newPassword, account.username);
  if (policyError) return json({ error: policyError }, { status: 400 });

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(users.id, account.id));

  const currentToken = getSessionToken(request);
  if (currentToken) await destroyOtherSessions(account.id, currentToken);

  return json({ ok: true });
}
