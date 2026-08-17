import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { requireSession } from "../../_lib/auth";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: { password?: string };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const password = payload.password ?? "";

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const account = rows[0];
  const valid = Boolean(account) && (await verifyPassword(password, account.passwordHash));
  return Response.json({ valid });
}
