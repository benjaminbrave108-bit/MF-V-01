import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

// No auth: used by reverse proxies / process managers for liveness checks.
// Deliberately returns no data beyond ok/error.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health] db check failed", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
