import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { listItems, workspaceRecipients } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { buildWorkspaces, loadListForUser } from "../../../_lib/lists";
import { listItemsInputSchema, parseBody } from "../../../_lib/validate";

// Listenin ürün satırlarının tamamını değiştirir (Excel'den yapıştırma dahil
// tüm düzenlemeler tek kayıtta). Tutar = adet × birim fiyat sunucuda hesaplanır.
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });
  if (list.status === "closed") return json({ error: "Liste kapalı; ürün değiştirilemez. Önce listeyi yeniden açın." }, { status: 409 });

  const parsed = await parseBody(request, listItemsInputSchema);
  if ("response" in parsed) return parsed.response;
  const items = parsed.data.items;

  const recipientIds = [...new Set(items.map((i) => i.recipientId).filter((v): v is number => typeof v === "number"))];
  if (recipientIds.length) {
    const valid = await db.select({ id: workspaceRecipients.id, cashAccountId: workspaceRecipients.cashAccountId }).from(workspaceRecipients).where(inArray(workspaceRecipients.id, recipientIds));
    if (valid.length !== recipientIds.length || valid.some((r) => r.cashAccountId !== list.cashAccountId)) {
      return json({ error: "Alıcı bu çalışma alanında yok" }, { status: 400 });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(listItems).where(eq(listItems.listId, id));
    if (items.length) {
      await tx.insert(listItems).values(
        items.map((item, index) => ({
          listId: id,
          position: index,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: Math.round(item.quantity * item.unitPrice * 100) / 100,
          recipientId: item.recipientId ?? null,
          note: item.note,
        })),
      );
    }
  });
  const [workspace] = await buildWorkspaces(session.user, [list.cashAccountId!], db);
  return json({ workspace });
});
