import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { cashTransfers } from "../../../../../db/schema";
import { requireSession } from "../../../_lib/auth";
import { canAccessCashAccount } from "../../../_lib/cash-access";
import { json, withErrorHandling } from "../../../_lib/http";

// The money already moved when the transfer was created (POST
// /api/cash-transfers) — the sender's kasa was debited and the target
// kasa's income record exists right away. Confirming here just flips
// `status` to "confirmed", which the client uses to switch that income
// record from a lighter "Onay Bekliyor" tone to its normal color.
export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, { status: 400 });

  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const rows = await tx.select().from(cashTransfers).where(eq(cashTransfers.id, id)).limit(1);
    const transfer = rows[0];
    if (!transfer) return { notFound: true as const };
    if (transfer.status !== "pending") return { alreadyResolved: true as const };

    // Only someone who can see the *target* kasa (the recipient side) may
    // confirm receipt — not the sender, and not just anyone.
    if (!(await canAccessCashAccount(session.user, transfer.toCashAccountId, tx))) {
      return { forbidden: true as const };
    }

    const [updated] = await tx
      .update(cashTransfers)
      .set({
        status: "confirmed",
        confirmedByUserId: session.user.id,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(cashTransfers.id, id))
      .returning();

    return { ok: true as const, transfer: updated };
  });

  if ("notFound" in result && result.notFound) return json({ error: "Aktarım bulunamadı" }, { status: 404 });
  if ("alreadyResolved" in result && result.alreadyResolved) {
    return json({ error: "Bu aktarım zaten sonuçlandırılmış" }, { status: 409 });
  }
  if ("forbidden" in result && result.forbidden) return json({ error: "Forbidden" }, { status: 403 });

  return json({ cashTransfer: result.transfer });
});
