import type { archive } from "../../../db/schema";

// The client's ArchiveItem shape (action/at/user/old) predates the DB schema
// and is used throughout app/page.tsx — translate DB rows to it here instead
// of renaming the schema or touching every client call site.
export function toClientArchiveItem(row: typeof archive.$inferSelect) {
  return {
    id: row.id,
    action: row.action,
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
    user: row.userName,
    old: row.oldRecord,
  };
}
