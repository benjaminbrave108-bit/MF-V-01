import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { archive, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { ensureFallbackKasa, fallbackKasaNameFor } from "../../_lib/records";
import type { Kind } from "../../_lib/types";
import { toClientArchiveItem } from "../../_lib/archive";
import { parseBody, recordUpdateSchema } from "../../_lib/validate";

function canAccessKind(user: { isAdmin: boolean; permissions: string[] }, kind: string): boolean {
  return user.isAdmin || user.permissions.includes(kind as Kind);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, recordUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return json({ error: "Record not found" }, { status: 404 });

  const kind = payload.kind ?? old.kind;
  // Both the record's current kind and its requested new kind must be
  // permitted — otherwise a user could smuggle a record from an
  // unauthorized bucket into an authorized one (or vice versa).
  if (!canAccessKind(session.user, old.kind) || !canAccessKind(session.user, kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const fallbackKasaName = fallbackKasaNameFor(kind);
  const source = payload.source ?? old.source;
  const cashAccount = payload.cashAccount || old.cashAccount || fallbackKasaName;

  const [record] = await db
    .update(records)
    .set({
      kind,
      date: payload.date ?? old.date,
      source,
      detail: payload.detail ?? old.detail,
      note: payload.note ?? old.note,
      person: payload.person ?? old.person,
      amount: payload.amount ?? old.amount,
      currency: payload.currency ?? old.currency,
      project: payload.project ?? old.project,
      tags: payload.tags ?? old.tags,
      monthlyExpense: payload.monthlyExpense ?? old.monthlyExpense,
      cashAccount,
      listName: payload.listName ?? old.listName,
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

  return json({ record, archiveEntry: toClientArchiveItem(archiveEntry), ensuredCash });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const existingRows = await db.select().from(records).where(eq(records.id, id)).limit(1);
  const old = existingRows[0];
  if (!old) return json({ error: "Record not found" }, { status: 404 });

  if (!canAccessKind(session.user, old.kind)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(records).where(eq(records.id, id));

  const [archiveEntry] = await db
    .insert(archive)
    .values({
      action: "Silindi",
      userName: session.user.name,
      oldRecord: old,
    })
    .returning();

  return json({ archiveEntry: toClientArchiveItem(archiveEntry) });
}
