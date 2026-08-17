import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { settings } from "../../../db/schema";
import { requireAdmin, requireSession } from "../_lib/auth";
import { json } from "../_lib/http";
import { isDataUriWithinLimit } from "../_lib/limits";

const SINGLETON_ID = 1;

async function getOrCreateSettings() {
  const db = getDb();
  const rows = await db.select().from(settings).where(eq(settings.id, SINGLETON_ID)).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(settings)
    .values({ id: SINGLETON_ID, typography: {} })
    .returning();
  return created;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const row = await getOrCreateSettings();
  return json({ settings: row });
}

export async function PUT(request: Request) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const logo = String(payload.logo ?? "");
  if (logo && !isDataUriWithinLimit(logo)) {
    return json({ error: "Logo must be a data:image/(png|jpeg|webp|svg+xml) URI under 512KB" }, { status: 413 });
  }

  await getOrCreateSettings();
  const db = getDb();
  const [row] = await db
    .update(settings)
    .set({
      company: String(payload.company ?? "Maliye-Finans"),
      logo: String(payload.logo ?? ""),
      typography: payload.typography && typeof payload.typography === "object" ? payload.typography : {},
      language: String(payload.language ?? "tr"),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, SINGLETON_ID))
    .returning();

  return json({ settings: row });
}
