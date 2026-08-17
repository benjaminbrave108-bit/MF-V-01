import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { financeNotes } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json } from "../_lib/http";

export async function GET(request: Request) {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(financeNotes).orderBy(desc(financeNotes.updatedAt), desc(financeNotes.id));
  return json({ notes: rows });
}

export async function POST(request: Request) {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
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

  return json({ note }, { status: 201 });
}
