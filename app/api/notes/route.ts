import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { financeNotes } from "../../../db/schema";
import { requireSession } from "../_lib/auth";

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id));
  return Response.json({ notes: rows });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const [note] = await db
    .insert(financeNotes)
    .values({
      title: String(payload.title ?? ""),
      content: String(payload.content ?? ""),
      status: String(payload.status ?? "important"),
      relation: String(payload.relation ?? "none"),
      relationDetail: String(payload.relationDetail ?? ""),
    })
    .returning();

  return Response.json({ note }, { status: 201 });
}
