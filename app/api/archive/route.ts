import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { archive } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { accessibleCashAccountNames } from "../_lib/cash-access";
import { json, withErrorHandling } from "../_lib/http";
import { toClientArchiveItem } from "../_lib/archive";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requirePermission(request, "archive");
  if ("response" in session) return session.response;

  const db = getDb();
  const [rows, accessibleNames] = await Promise.all([
    db.select().from(archive).orderBy(desc(archive.at), desc(archive.id)),
    accessibleCashAccountNames(session.user, db),
  ]);
  const allowedNames = accessibleNames === null ? null : new Set(accessibleNames);
  const scoped = allowedNames === null
    ? rows
    : rows.filter((row) => {
        const oldRecord = row.oldRecord as { kind: string; source: string; cashAccount: string };
        const name = oldRecord.kind === "cash" ? oldRecord.source : oldRecord.cashAccount;
        return !name || allowedNames.has(name);
      });
  return json({ archive: scoped.map(toClientArchiveItem) });
});
