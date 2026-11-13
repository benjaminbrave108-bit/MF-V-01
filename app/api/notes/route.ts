import { getDb } from "../../../db";
import { financeNotes } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { dedupePeople, listClientNotes, resolveNoteStatus } from "../_lib/notes";
import { noteInputSchema, parseBody } from "../_lib/validate";
import { logActivity } from "../_lib/activity";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;

  const db = getDb();
  return json({ notes: await listClientNotes(session.user.id, db) });
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
      status: await resolveNoteStatus(payload.status, db),
      relation: payload.relation,
      relationDetail: payload.relationDetail,
      assignedUserIds: payload.assignedUserIds,
      people: dedupePeople(payload.people),
      attachments: payload.addAttachments,
    })
    .returning();

  await logActivity(session.user, { category: "note", action: "create", summary: `Not eklendi: ${note.title}` });
  const created = (await listClientNotes(session.user.id, db)).find((n) => n.id === note.id);
  return json({ note: created }, { status: 201 });
});
