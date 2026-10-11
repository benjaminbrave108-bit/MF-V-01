import { and, eq, notInArray } from "drizzle-orm";
import { getDb } from "../../../../db";
import { listMembers, lists, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { buildListDetails, loadListForUser } from "../../_lib/lists";
import { listUpdateSchema, parseBody } from "../../_lib/validate";

type Ctx = { params: Promise<{ id: string }> };

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e?.cause?.code ?? e?.code) === "23505";
}

export const PUT = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, listUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  try {
    await db.transaction(async (tx) => {
      const name = payload.name ?? list.name;
      await tx
        .update(lists)
        .set({ code: payload.code ?? list.code, name, date: payload.date ?? list.date, updatedAt: new Date() })
        .where(eq(lists.id, id));
      // Liste adı değiştiyse bağlı kayıtlardaki ad kopyası da güncellenir.
      if (name !== list.name) await tx.update(records).set({ listName: name }).where(eq(records.listId, id));

      if (payload.members) {
        const keepIds = payload.members.map((m) => m.id).filter((v): v is number => typeof v === "number");
        // Listeden çıkarılan üyelerin dağıtım/paylaşımları da (cascade) silinir.
        if (keepIds.length) await tx.delete(listMembers).where(and(eq(listMembers.listId, id), notInArray(listMembers.id, keepIds)));
        else await tx.delete(listMembers).where(eq(listMembers.listId, id));
        for (const m of payload.members) {
          const memberName = m.name.trim();
          if (!memberName) continue;
          if (typeof m.id === "number") {
            await tx.update(listMembers).set({ name: memberName }).where(and(eq(listMembers.id, m.id), eq(listMembers.listId, id)));
          } else {
            await tx.insert(listMembers).values({ listId: id, name: memberName });
          }
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return json({ error: "Bu çalışma alanında aynı kodlu bir liste zaten var" }, { status: 409 });
    throw error;
  }
  const [detail] = await buildListDetails([id], session.user, db);
  return json({ list: detail });
});

// Listeyi siler; bağlı gelir/gider kayıtları silinmez, yalnızca listeden ayrılır.
export const DELETE = withErrorHandling<Ctx>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const { list, canWrite } = await loadListForUser(id, session.user, db);
  if (!list) return json({ error: "List not found" }, { status: 404 });
  if (!canWrite) return json({ error: "Forbidden" }, { status: 403 });

  await db.transaction(async (tx) => {
    await tx.update(records).set({ listName: "" }).where(eq(records.listId, id));
    await tx.delete(lists).where(eq(lists.id, id));
  });
  return json({ ok: true });
});
