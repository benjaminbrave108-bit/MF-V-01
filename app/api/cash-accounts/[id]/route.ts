import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db";
import { archive, cashAccounts, records, users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { requireSession } from "../../_lib/auth";
import { canWriteCashAccount } from "../../_lib/cash-access";
import { json, withErrorHandling } from "../../_lib/http";
import { markListKasa, setRjKasa } from "../../_lib/lists";
import { clearAttempts, isRateLimited, recordFailedAttempt } from "../../_lib/rate-limit";
import { parseBody } from "../../_lib/validate";

const kasaUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  listKasa: z.boolean().optional(),
  rjKasa: z.boolean().optional(),
  sectionId: z.number().int().nullable().optional(),
});

const kasaDeleteSchema = z.object({ password: z.string().min(1).max(200) });

function parseId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// PUT /api/cash-accounts/:id — kasayı düzenle (ad, Liste/RJ işareti, bölüm).
// Ad değişirse kasaya bağlı tüm kayıtların kasa adı da güncellenir.
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = parseId((await params).id);
  if (id === null) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, kasaUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  const db = getDb();
  const [account] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, id)).limit(1);
  if (!account) return json({ error: "Kasa bulunamadı" }, { status: 404 });
  if (!(await canWriteCashAccount(session.user, id, db))) return json({ error: "Forbidden" }, { status: 403 });

  const [clash] = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.name, payload.name)).limit(1);
  if (clash && clash.id !== id) return json({ error: "Bu isimde bir kasa zaten var" }, { status: 409 });

  await db.transaction(async (tx) => {
    await tx
      .update(cashAccounts)
      .set({ name: payload.name, updatedAt: new Date(), ...(payload.sectionId !== undefined ? { sectionId: payload.sectionId } : {}) })
      .where(eq(cashAccounts.id, id));
    if (payload.name !== account.name) {
      await tx.update(records).set({ cashAccount: payload.name }).where(eq(records.cashAccountId, id));
      await tx.update(records).set({ source: payload.name }).where(and(eq(records.cashAccountId, id), eq(records.kind, "cash")));
    }
    if (payload.listKasa) await markListKasa(id, tx);
    if (payload.rjKasa !== undefined) await setRjKasa(id, payload.rjKasa, tx);
  });
  return json({ ok: true });
});

// DELETE /api/cash-accounts/:id — kasayı ve bağlı tüm kayıtlarını siler.
// İkinci onay: oturumdaki kullanıcının şifresi gövdede gönderilmelidir.
// Silinen her kayıt Arşiv'e "Silindi" olarak yazılır.
export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const id = parseId((await params).id);
  if (id === null) return json({ error: "Invalid id" }, { status: 400 });

  const parsed = await parseBody(request, kasaDeleteSchema);
  if ("response" in parsed) return parsed.response;

  const rateLimitKey = `delete-kasa:${session.user.id}`;
  const retryAfter = isRateLimited(rateLimitKey);
  if (retryAfter !== null) {
    return json({ error: "Çok fazla hatalı deneme. Daha sonra tekrar deneyin." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const db = getDb();
  const [account] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, id)).limit(1);
  if (!account) return json({ error: "Kasa bulunamadı" }, { status: 404 });
  if (!(await canWriteCashAccount(session.user, id, db))) return json({ error: "Forbidden" }, { status: 403 });

  const [me] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  const valid = Boolean(me) && (await verifyPassword(parsed.data.password, me.passwordHash));
  if (!valid) {
    recordFailedAttempt(rateLimitKey);
    return json({ error: "Şifre hatalı" }, { status: 403 });
  }
  clearAttempts(rateLimitKey);

  const deleted = await db.transaction(async (tx) => {
    const rows = await tx.select().from(records).where(eq(records.cashAccountId, id));
    if (rows.length > 0) {
      await tx.insert(archive).values(rows.map((old) => ({ action: "Silindi", userName: session.user.name, oldRecord: old })));
      await tx.delete(records).where(eq(records.cashAccountId, id));
    }
    await tx.delete(cashAccounts).where(eq(cashAccounts.id, id));
    return rows.length;
  });
  return json({ ok: true, deletedRecords: deleted });
});
