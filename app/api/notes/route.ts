import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { financeNotes, users } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { unreadNoteIdSet } from "../_lib/notes";
import { noteInputSchema, parseBody } from "../_lib/validate";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const db = getDb();
  const [rows, userRows] = await Promise.all([
    db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const unreadIds = await unreadNoteIdSet(session.user.id, rows, db);

  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const notes = rows.map((row) => ({
    ...row,
    assignedUserNames: (row.assignedUserIds as number[]).map((id) => nameById.get(id)).filter((name): name is string => Boolean(name)),
    isUnread: unreadIds.has(row.id),
  }));

  return json({ notes });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, noteInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const [note] = await db
    .insert(financeNotes)
    .values({
      title: payload.title,
      content: payload.content,
      status: payload.status,
      relation: payload.relation,
      relationDetail: payload.relationDetail,
      assignedUserIds: payload.assignedUserIds,
    })
    .returning();

  return json({ note }, { status: 201 });
});
