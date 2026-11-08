import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { financeNotes } from "../../../../../../db/schema";
import { requirePermission } from "../../../../_lib/auth";
import { json, withErrorHandling } from "../../../../_lib/http";

// GET /api/notes/:id/attachments/:index — tek bir belgenin içeriği (liste yanıtında gönderilmez).
export const GET = withErrorHandling<{ params: Promise<{ id: string; index: string }> }>(async (request, { params }) => {
  const session = await requirePermission(request, "notes");
  if ("response" in session) return session.response;
  const { id: idParam, index: indexParam } = await params;
  const id = Number(idParam);
  const index = Number(indexParam);
  if (!Number.isInteger(id) || !Number.isInteger(index) || index < 0) return json({ error: "Invalid id" }, { status: 400 });
  const [note] = await getDb().select({ attachments: financeNotes.attachments }).from(financeNotes).where(eq(financeNotes.id, id)).limit(1);
  const attachment = ((note?.attachments as { name: string; data: string }[]) ?? [])[index];
  if (!attachment) return json({ error: "Not found" }, { status: 404 });
  return json({ attachment });
});
