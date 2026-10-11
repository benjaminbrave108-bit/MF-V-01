import { inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { listMembers, lists } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { buildListDetails, visibleListOwnerIds } from "../_lib/lists";
import { listInputSchema, parseBody } from "../_lib/validate";

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
}

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin && !session.user.permissions.includes("lists")) return json({ error: "Forbidden" }, { status: 403 });

  const db = getDb();
  const owners = await visibleListOwnerIds(session.user, db);
  const rows =
    owners === null
      ? await db.select({ id: lists.id }).from(lists)
      : await db.select({ id: lists.id }).from(lists).where(inArray(lists.ownerUserId, owners));
  const details = await buildListDetails(
    rows.map((r) => r.id),
    session.user,
    db,
  );
  details.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  return json({ lists: details });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin && !session.user.permissions.includes("lists")) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, listInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;
  // Çalışma alanı: kendi verileriniz (varsayılan) ya da — süper admin ise — başka bir kullanıcının alanı.
  const ownerUserId = session.user.isSuperAdmin && payload.ownerUserId ? payload.ownerUserId : session.user.id;

  const db = getDb();
  try {
    const created = await db.transaction(async (tx) => {
      const [list] = await tx
        .insert(lists)
        .values({ code: payload.code, name: payload.name, date: payload.date, currency: payload.currency, ownerUserId })
        .returning();
      const names = [...new Set(payload.members.map((m) => m.trim()).filter(Boolean))];
      if (names.length) await tx.insert(listMembers).values(names.map((name) => ({ listId: list.id, name })));
      return list;
    });
    const [detail] = await buildListDetails([created.id], session.user, db);
    return json({ list: detail }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return json({ error: "Bu çalışma alanında aynı kodlu bir liste zaten var" }, { status: 409 });
    throw error;
  }
});
