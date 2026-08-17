import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { financeNotes } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { noteInputSchema, parseBody } from "../_lib/validate";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id));
  return json({ notes: rows });
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
    })
    .returning();

  return json({ note }, { status: 201 });
});
