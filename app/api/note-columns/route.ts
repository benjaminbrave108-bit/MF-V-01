import { inArray, notInArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb } from "../../../db";
import { financeNotes, noteColumns } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { noteColumnsInputSchema, parseBody } from "../_lib/validate";
import { logActivity } from "../_lib/activity";

async function readColumns() {
  const rows = await getDb().select().from(noteColumns).orderBy(noteColumns.sortOrder, noteColumns.id);
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label, color: r.color }));
}

// Not panosunun sütunları oturum açan herkese okunur.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  return json({ columns: await readColumns() });
});

// PUT — Ayarlar > Not Görevleri: tüm listeyi (sıra, ad, renk) tek seferde kaydeder. Listede
// olmayan sütun silinir; içindeki notlar ilk sütuna taşınır.
export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, noteColumnsInputSchema);
  if ("response" in parsed) return parsed.response;

  const db = getDb();
  await db.transaction(async (tx) => {
    const existing = await tx.select().from(noteColumns);
    const known = new Set(existing.map((c) => c.key));
    const wanted = parsed.data.columns.map((c, index) => ({
      key: c.key && known.has(c.key) ? c.key : `c-${randomBytes(4).toString("hex")}`,
      label: c.label,
      color: c.color,
      sortOrder: index,
    }));
    const keepKeys = wanted.map((w) => w.key);
    const removed = existing.filter((c) => !keepKeys.includes(c.key)).map((c) => c.key);
    if (removed.length) await tx.update(financeNotes).set({ status: keepKeys[0] }).where(inArray(financeNotes.status, removed));
    for (const w of wanted) {
      await tx.insert(noteColumns).values(w).onConflictDoUpdate({ target: noteColumns.key, set: { label: w.label, color: w.color, sortOrder: w.sortOrder } });
    }
    await tx.delete(noteColumns).where(notInArray(noteColumns.key, keepKeys));
  });
  await logActivity(session.user, { category: "note", action: "columns", summary: `Not görev sütunları güncellendi: ${parsed.data.columns.map((c) => c.label).join(", ")}` });
  return json({ columns: await readColumns() });
});
