import { z } from "zod";
import { getDb } from "../../../../../db";
import { cashAccounts } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "../../../_lib/auth";
import { canManageCashAccountAccess, setDashboardShareEnabled } from "../../../_lib/cash-access";
import { json, withErrorHandling } from "../../../_lib/http";
import { parseBody } from "../../../_lib/validate";

const bodySchema = z.object({ enabled: z.boolean() });

// Owner-only (or super admin) toggle for Ayarlar > Paylaşım: whether this
// kasa's totals may be folded into a super admin's Ana Sayfa (see
// Ayarlar > Görüntüle, gated separately on the super admin's own side).
export const PUT = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();
  const existing = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, id)).limit(1);
  if (!existing[0]) return json({ error: "Kasa not found" }, { status: 404 });
  if (!(await canManageCashAccountAccess(session.user, id, db))) return json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseBody(request, bodySchema);
  if ("response" in parsed) return parsed.response;

  await setDashboardShareEnabled(id, parsed.data.enabled, db);
  return json({ ok: true, dashboardShareEnabled: parsed.data.enabled });
});
