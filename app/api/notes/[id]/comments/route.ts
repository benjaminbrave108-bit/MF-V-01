import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { financeNotes, noteComments, noteReads } from "../../../../../db/schema";
import { requirePermission } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { canPostNoteComment } from "../../../_lib/notes";
import { noteCommentInputSchema, parseBody } from "../../../_lib/validate";
import { logActivity } from "../../../_lib/activity";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/notes/:id/comments — notun mesajları + bu kullanıcının yazıp yazamayacağı.
export const GET = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });
  const db = getDb();
  const [note] = await db.select().from(financeNotes).where(eq(financeNotes.id, id)).limit(1);
  if (!note) return json({ error: "Note not found" }, { status: 404 });
  const comments = await db.select().from(noteComments).where(eq(noteComments.noteId, id)).orderBy(asc(noteComments.createdAt), asc(noteComments.id));
  return json({ comments, canPost: canPostNoteComment(session.user, note) });
});

// POST /api/notes/:id/comments — yalnızca nota atanmış kullanıcılar ve yöneticiler.
export const POST = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });
  const parsed = await parseBody(request, noteCommentInputSchema);
  if ("response" in parsed) return parsed.response;

  const db = getDb();
  const [note] = await db.select().from(financeNotes).where(eq(financeNotes.id, id)).limit(1);
  if (!note) return json({ error: "Note not found" }, { status: 404 });
  if (!canPostNoteComment(session.user, note)) return json({ error: "Bu nota yalnızca atanan kullanıcılar mesaj yazabilir" }, { status: 403 });

  const [comment] = await db.insert(noteComments).values({ noteId: id, userId: session.user.id, userName: session.user.name, text: parsed.data.text }).returning();
  // Not diğer kullanıcılar için yeniden "okunmamış" olur; yazanın kendi okundu işareti güncellenir.
  const now = new Date();
  const readAt = new Date(now.getTime() + 1);
  await db.update(financeNotes).set({ updatedAt: now }).where(eq(financeNotes.id, id));
  await db
    .insert(noteReads)
    .values({ userId: session.user.id, noteId: id, lastReadAt: readAt })
    .onConflictDoUpdate({ target: [noteReads.userId, noteReads.noteId], set: { lastReadAt: readAt } });
  await logActivity(session.user, { category: "note", action: "comment", summary: `Nota mesaj yazıldı: ${note.title}` });
  return json({ comment }, { status: 201 });
});
