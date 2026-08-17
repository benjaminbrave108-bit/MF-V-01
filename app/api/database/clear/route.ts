import { getDb } from "../../../../db";
import { archive, financeNotes, preparedReports, records } from "../../../../db/schema";
import { requireAdmin } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";

// Wipes records/archive/notes/prepared reports (not users/settings). The
// UI gates this behind DeleteConfirmModal's two-step confirm, whose second
// step already re-verifies the admin's password via /api/auth/verify-password
// before calling this — same pattern as every other delete in the app.
export const POST = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(records);
    await tx.delete(archive);
    await tx.delete(financeNotes);
    await tx.delete(preparedReports);
  });

  return json({ ok: true });
});
