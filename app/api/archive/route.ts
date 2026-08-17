import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { archive } from "../../../db/schema";
import { requirePermission } from "../_lib/auth";
import { json } from "../_lib/http";
import { toClientArchiveItem } from "../_lib/archive";

export async function GET(request: Request) {
  const session = await requirePermission(request, "archive");
  if ("response" in session) return session.response;

  const db = getDb();
  const rows = await db.select().from(archive).orderBy(desc(archive.at), desc(archive.id));
  return json({ archive: rows.map(toClientArchiveItem) });
}
