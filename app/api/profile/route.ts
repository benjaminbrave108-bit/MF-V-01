import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
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
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const name = payload.name?.trim();
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const db = getDb();
  const [account] = await db
    .update(users)
    .set({ name, avatar: payload.avatar ?? "", updatedAt: new Date() })
    .where(eq(users.id, session.user.id))
    .returning();

  return Response.json({
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
