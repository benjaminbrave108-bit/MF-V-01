import { and, eq, inArray, isNotNull, isNull, notLike, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db";
import { archive, records } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { canWriteCashAccount } from "../../_lib/cash-access";
import { json, withErrorHandling } from "../../_lib/http";
import { parseBody } from "../../_lib/validate";

// Önceki Excel aktarımlarını "aylık tek kalem"e toplar: aktarımdaki her (kasa, gelir/gider, ay, para birimi) grubu tek
// kayıt olur; eski satırların hepsi o kaydın Detay tablosunda (tarih, başlık, kalem, adet, birim fiyat, kişi, proje, tutar) durur.
// Satırlar silinmez, Arşiv'e "Silindi" olarak düşer. Bir grupta 498'den fazla satır varsa Detay'a sığmayacağı için o grup
// olduğu gibi bırakılır.
const MAX_DETAIL_ROWS = 498;
const HEADER = ["Tarih", "Başlık", "Kalem", "Adet", "Birim fiyat", "Kişi", "Proje", "Tutar"];

const bodySchema = z.object({ batchId: z.string().min(6).max(64), dryRun: z.boolean().optional().default(true) });

type Row = typeof records.$inferSelect;

// Daha önce aylığa toplanmış veya aylık tek kalem olarak yüklenmiş kayıtlar tekrar toplanmaz.
const notMonthly = or(isNull(records.importKey), and(notLike(records.importKey, "m|%"), notLike(records.importKey, "mc|%")));

function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const cell = (v: unknown) => String(v ?? "").slice(0, 480);

function detailRowsOf(r: Row): string[][] {
  const table = (r.detailTable as string[][] | null) ?? [];
  const base = (item: string, qty: string, unit: string, amount: string) => [r.date, cell(r.source), cell(item), qty, unit, cell(r.person), cell(r.project), amount];
  if (table.length > 1) {
    // Faturadaki kalemler: [Ürün, Adet, Birim fiyat, Tutar]
    return table.slice(1).map((t) => base(t[0] ?? "", cell(t[1]), cell(t[2]), cell(t[3])));
  }
  return [base(r.detail ?? "", "", "", String(round2(r.amount)))];
}

function plan(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.cashAccountId}|${r.kind}|${r.date.slice(0, 7)}|${r.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, list]) => {
    const [kasaId, kind, month, currency] = key.split("|");
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const detail = sorted.flatMap(detailRowsOf);
    const projects = [...new Set(sorted.map((r) => r.project).filter(Boolean))];
    return {
      key,
      kasaId: Number(kasaId),
      kasa: sorted[0].cashAccount,
      kind: kind as "income" | "expense",
      month,
      currency,
      sourceIds: sorted.map((r) => r.id),
      amount: round2(sorted.reduce((a, r) => a + r.amount, 0)),
      detailRows: detail.length,
      skipped: detail.length > MAX_DETAIL_ROWS,
      projects,
      detailTable: [HEADER, ...detail],
    };
  });
}

// GET: toplanabilecek (henüz aylık olmayan) aktarımların listesi.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const rows = await getDb()
    .select()
    .from(records)
    .where(and(isNotNull(records.importBatch), inArray(records.kind, ["income", "expense"]), notMonthly));
  const batches = new Map<string, { batchId: string; kasa: string; income: number; expense: number; months: Set<string> }>();
  for (const r of rows) {
    const id = r.importBatch as string;
    const b = batches.get(id) ?? { batchId: id, kasa: r.cashAccount, income: 0, expense: 0, months: new Set<string>() };
    if (r.kind === "income") b.income++;
    else b.expense++;
    b.months.add(r.date.slice(0, 7));
    batches.set(id, b);
  }
  return json({ batches: [...batches.values()].map((b) => ({ ...b, months: [...b.months].sort() })) });
});

// POST: dryRun=true (varsayılan) yalnızca sonucu hesaplar; dryRun=false uygular.
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const parsed = await parseBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;
  const { batchId, dryRun } = parsed.data;

  const db = getDb();
  const rows = await db
    .select()
    .from(records)
    .where(and(eq(records.importBatch, batchId), inArray(records.kind, ["income", "expense"]), notMonthly));
  if (!rows.length) return json({ error: "Bu aktarımda toplanacak kayıt yok" }, { status: 404 });
  for (const kasaId of new Set(rows.map((r) => r.cashAccountId))) {
    if (kasaId != null && !(await canWriteCashAccount(session.user, kasaId, db))) return json({ error: "Forbidden" }, { status: 403 });
  }

  const groups = plan(rows);
  const summary = groups.map(({ detailTable: _d, sourceIds, ...g }) => ({ ...g, sourceCount: sourceIds.length }));
  if (dryRun) return json({ dryRun: true, groups: summary });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const applied = await db.transaction(async (tx) => {
    let created = 0;
    let removed = 0;
    for (const g of groups) {
      if (g.skipped) continue;
      const first = byId.get(g.sourceIds[0])!;
      const label = g.kind === "income" ? "Aylık Gelir" : "Aylık Gider";
      await tx.insert(records).values({
        kind: g.kind,
        date: monthEnd(g.month),
        source: `${g.month} ${label} · ${g.kasa}`.slice(0, 200),
        detail: `${g.sourceIds.length} satır · Excel özeti`,
        note: `Excel aktarımı: ${batchId}`,
        person: "",
        amount: g.amount,
        currency: g.currency,
        project: g.projects.length === 1 ? g.projects[0] : "",
        tags: [],
        cashAccount: g.kasa,
        cashAccountId: g.kasaId,
        sectionId: first.sectionId,
        detailTable: g.detailTable,
        importBatch: `${batchId}-m`,
        importKey: `mc|${batchId}|${g.key}`.slice(0, 240),
      });
      created++;
      await tx.insert(archive).values(g.sourceIds.map((id) => ({ action: "Silindi", userName: session.user.name, oldRecord: byId.get(id)! })));
      await tx.delete(records).where(inArray(records.id, g.sourceIds));
      removed += g.sourceIds.length;
    }
    return { created, removed };
  });
  return json({ dryRun: false, ...applied, groups: summary });
});
