import { getDb } from "../../../../db";
import { cashAccounts } from "../../../../db/schema";
import { requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";

// GET /api/cash-accounts/all — every kasa's {id, name}, regardless of
// kasa-level access. Used only to populate the "Aktarılacak Kasa" selector
// in Kasa Aktarımı: sending money to a kasa shouldn't require already
// being able to see its data, so this deliberately bypasses
// accessibleCashAccountIds. No balances, owners or access grants are
// exposed — just enough to pick a transfer target by name.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  if (!session.user.isAdmin && !session.user.permissions.includes("cash")) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const rows = await db.select({ id: cashAccounts.id, name: cashAccounts.name }).from(cashAccounts).orderBy(cashAccounts.name);

  return json({ cashAccounts: rows });
});
