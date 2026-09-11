import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { cashAccountAccess, cashAccounts, users } from "../../../db/schema";
import { requireSession } from "../_lib/auth";
import { accessibleCashAccountIds } from "../_lib/cash-access";
import { json, withErrorHandling } from "../_lib/http";

// GET /api/cash-accounts — kasa listesi.
// - Süper admin: hepsi, sahibi ve kaç kullanıcıyla paylaşıldığı bilgisiyle
//   (Ayarlar > Kasa Erişimi panosu bu uçtan besleniyor).
// - Diğerleri: yalnız kendi erişebildikleri kasalar. `isOwner` ve
//   `sharedWithUserIds` de eklenir ki Kasalar sayfasındaki "Paylaş" düğmesi
//   (sahibi olduğu kasalar için) client tarafında ayrı bir istek atmadan
//   hangi kasaları yönetebileceğini bilsin — asıl yetki denetimi yine
//   canManageCashAccountAccess'te, sunucu tarafında yapılıyor.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const db = getDb();

  if (session.user.isSuperAdmin) {
    const rows = await db
      .select({
        id: cashAccounts.id,
        name: cashAccounts.name,
        ownerUserId: cashAccounts.ownerUserId,
        ownerName: users.name,
        createdAt: cashAccounts.createdAt,
        dashboardShareEnabled: cashAccounts.dashboardShareEnabled,
      })
      .from(cashAccounts)
      .leftJoin(users, eq(cashAccounts.ownerUserId, users.id))
      .orderBy(cashAccounts.name);

    const accessRows = await db
      .select({ cashAccountId: cashAccountAccess.cashAccountId, userId: cashAccountAccess.userId })
      .from(cashAccountAccess);
    const accessByKasa = new Map<number, number[]>();
    for (const row of accessRows) {
      const list = accessByKasa.get(row.cashAccountId) ?? [];
      list.push(row.userId);
      accessByKasa.set(row.cashAccountId, list);
    }

    return json({
      cashAccounts: rows.map((row) => ({
        ...row,
        isOwner: row.ownerUserId === session.user.id,
        sharedWithUserIds: accessByKasa.get(row.id) ?? [],
      })),
    });
  }

  const accessibleIds = await accessibleCashAccountIds(session.user, db);
  if (!accessibleIds || !accessibleIds.length) return json({ cashAccounts: [] });
  const allowed = new Set(accessibleIds);

  const [all, accessRows] = await Promise.all([
    db
      .select({
        id: cashAccounts.id,
        name: cashAccounts.name,
        ownerUserId: cashAccounts.ownerUserId,
        ownerName: users.name,
        dashboardShareEnabled: cashAccounts.dashboardShareEnabled,
      })
      .from(cashAccounts)
      .leftJoin(users, eq(cashAccounts.ownerUserId, users.id)),
    db.select({ cashAccountId: cashAccountAccess.cashAccountId, userId: cashAccountAccess.userId }).from(cashAccountAccess),
  ]);
  const accessByKasa = new Map<number, number[]>();
  for (const row of accessRows) {
    const list = accessByKasa.get(row.cashAccountId) ?? [];
    list.push(row.userId);
    accessByKasa.set(row.cashAccountId, list);
  }

  return json({
    cashAccounts: all
      .filter((row) => allowed.has(row.id))
      .map((row) => ({
        ...row,
        isOwner: row.ownerUserId === session.user.id,
        sharedWithUserIds: accessByKasa.get(row.id) ?? [],
      })),
  });
});
