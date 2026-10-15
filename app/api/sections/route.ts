import { getDb } from "../../../db";
import { kasaSections } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { parseBody, sectionInputSchema } from "../_lib/validate";

// Ayarlar > Bölümler: yönetici tanımlı kasa / gelir / gider bölümleri. Herkes okur (kutular için), yalnızca yönetici yazar.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const rows = await getDb().select().from(kasaSections).orderBy(kasaSections.id);
  return json({ sections: rows.map((r) => ({ id: r.id, scope: r.scope, name: r.name, color: r.color })) });
});

export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!session.user.isAdmin) return json({ error: "Forbidden" }, { status: 403 });
  const parsed = await parseBody(request, sectionInputSchema);
  if ("response" in parsed) return parsed.response;
  try {
    const [created] = await getDb().insert(kasaSections).values(parsed.data).returning();
    return json({ section: { id: created.id, scope: created.scope, name: created.name, color: created.color } }, { status: 201 });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e?.cause?.code ?? e?.code) === "23505") return json({ error: "Bu adla bir bölüm zaten var" }, { status: 409 });
    throw error;
  }
});
