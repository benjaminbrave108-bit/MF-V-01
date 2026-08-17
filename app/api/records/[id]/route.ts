import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { archive, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../../_lib/records";
import { toClientArchiveItem } from "../../_lib/archive";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return Response.json({ error: "Record not found" }, { status: 404 });

  const kind = String(payload.kind ?? old.kind);
  const fallbackKasaName = fallbackKasaNameFor(kind);
  const source = String(payload.source ?? "");
  const cashAccount = String(payload.cashAccount ?? "") || fallbackKasaName;

  const [record] = await db
    .update(records)
    .set({
      kind,
      date: String(payload.date ?? old.date),
      source,
      detail: String(payload.detail ?? ""),
      note: String(payload.note ?? ""),
      person: String(payload.person ?? ""),
      amount: Number(payload.amount ?? 0),
      currency: String(payload.currency ?? "USD"),
      project: String(payload.project ?? ""),
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      monthlyExpense: Boolean(payload.monthlyExpense),
      cashAccount,
      listName: String(payload.listName ?? ""),
      updatedAt: new Date(),
    })
    .where(eq(records.id, id))
    .returning();

  // Cascade: if a cash account's display name changed, keep every record
  // that referenced it by name pointing at the new name.
  if (old.kind === "cash" && old.source !== source) {
    await db.update(records).set({ cashAccount: source }).where(eq(records.cashAccount, old.source));
  }

  const [archiveEntry] = await db
    .insert(archive)
    .values({
      action: "Düzenlendi",
      userName: session.user.name,
      oldRecord: old,
    })
    .returning();

  const ensuredCash = await ensureFallbackKasa(fallbackKasaName);

  return Response.json({ record, archiveEntry: toClientArchiveItem(archiveEntry), ensuredCash });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return Response.json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return Response.json({ error: "Record not found" }, { status: 404 });

  await db.delete(records).where(eq(records.id, id));

  const [archiveEntry] = await db
    .insert(archive)
    .values({
      action: "Silindi",
      userName: session.user.name,
      oldRecord: old,
    })
    .returning();

  return Response.json({ archiveEntry: toClientArchiveItem(archiveEntry) });
}
