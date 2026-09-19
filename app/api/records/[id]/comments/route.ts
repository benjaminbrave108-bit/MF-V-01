import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { recordComments, records } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { canAccessRecord } from "../../../_lib/records";
import { reactionsByCommentId } from "../../../_lib/comments";
import { json, withErrorHandling } from "../../../_lib/http";
import { commentInputSchema, parseBody } from "../../../_lib/validate";

async function requireVisibleRecord(request: Request, idParam: string) {
  const session = await requireSession(request);
  if ("response" in session) return session;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return { response: json({ error: "Invalid id" }, { status: 400 }) };
  const db = getDb();
  const rows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const record = rows[0];
  if (!record) return { response: json({ error: "Record not found" }, { status: 404 }) };
  if (!(await canAccessRecord(session.user, record, db))) return { response: json({ error: "Forbidden" }, { status: 403 }) };
  return { user: session.user, id, db };
}

// Bir kayda ("Kasalar"/"Gelir"/"Gider" satırı) bağlı yorum dizisi — kaydı
// görebilen herkes okuyup ekleyebilir; sahiplik veya yazma yetkisi aranmaz
// (bkz. canAccessRecord — sadece kasa/kayıt görünürlüğü yeterli).
export const GET = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireVisibleRecord(request, idParam);
  if ("response" in gate) return gate.response;

  const rows = await gate.db
    .select()
    .from(recordComments)
    .where(eq(recordComments.recordId, gate.id))
    .orderBy(asc(recordComments.createdAt), asc(recordComments.id));

  const reactions = await reactionsByCommentId(rows.map((r) => r.id), gate.user.id, gate.db);
  return json({ comments: rows.map((r) => ({ ...r, reactions: reactions.get(r.id) ?? [] })) });
});

export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireVisibleRecord(request, idParam);
  if ("response" in gate) return gate.response;

  const parsed = await parseBody(request, commentInputSchema);
  if ("response" in parsed) return parsed.response;

  const [comment] = await gate.db
    .insert(recordComments)
    .values({
      recordId: gate.id,
      userId: gate.user.id,
      userName: gate.user.name,
      text: parsed.data.text,
      isAttention: parsed.data.isAttention,
    })
    .returning();

  return json({ comment: { ...comment, reactions: [] } }, { status: 201 });
});
