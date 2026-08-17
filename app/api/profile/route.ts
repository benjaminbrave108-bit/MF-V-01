import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json } from "../_lib/http";
import { isDataUriWithinLimit } from "../_lib/limits";
import type { Page } from "../_lib/types";

// Self-service profile edit: only name/avatar. Username, role and
// permissions are managed centrally via /api/users (admin-only).
export async function PUT(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: { name?: string; avatar?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const name = payload.name?.trim();
  if (!name) return json({ error: "Name is required" }, { status: 400 });
  const avatar = payload.avatar ?? "";
  if (avatar && !isDataUriWithinLimit(avatar)) {
    return json({ error: "Avatar must be a data:image/(png|jpeg|webp|svg+xml) URI under 512KB" }, { status: 413 });
  }

  const db = getDb();
  const [account] = await db
    .update(users)
    .set({ name, avatar, updatedAt: new Date() })
    .where(eq(users.id, session.user.id))
    .returning();

  return json({
    profile: {
      name: account.name,
      username: account.username,
      role: account.roleLabel,
      isAdmin: account.isAdmin,
      permissions: (account.permissions as Page[]) ?? [],
      avatar: account.avatar,
    },
  });
}
