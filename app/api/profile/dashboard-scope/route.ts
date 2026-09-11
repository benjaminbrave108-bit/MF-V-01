import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { requireSuperAdmin } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { parseBody, dashboardScopeInputSchema } from "../../_lib/validate";

// Ayarlar > Görüntüle: lets a super admin pick which other users' kasas get
// merged into their own Ana Sayfa totals (Toplam Gelir/Gider/Net/Bakiye).
// Super-admin-only — a plain user's Ana Sayfa always stays limited to their
// own data, with no equivalent "merge others in" option.
export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireSuperAdmin(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, dashboardScopeInputSchema);
  if ("response" in parsed) return parsed.response;

  // Never include yourself — your own kasas are already always in scope.
  const includedUserIds = [...new Set(parsed.data.includedUserIds)].filter((id) => id !== session.user.id);

  const db = getDb();
  const [account] = await db
    .update(users)
    .set({ dashboardIncludedUserIds: includedUserIds, updatedAt: new Date() })
    .where(eq(users.id, session.user.id))
    .returning();

  return json({ dashboardIncludedUserIds: (account.dashboardIncludedUserIds as number[]) ?? [] });
});
