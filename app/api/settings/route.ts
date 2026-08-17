import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { settings } from "../../../db/schema";
import { requireAdmin, requireSession } from "../_lib/auth";
import { json, withErrorHandling } from "../_lib/http";
import { isDataUriWithinLimit } from "../_lib/limits";
import { parseBody, settingsInputSchema } from "../_lib/validate";

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

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const row = await getOrCreateSettings();
  return json({ settings: row });
});

export const PUT = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const parsed = await parseBody(request, settingsInputSchema);
  if ("response" in parsed) return parsed.response;
  const payload = parsed.data;

  if (payload.logo && !isDataUriWithinLimit(payload.logo)) {
    return json({ error: "Logo must be a data:image/(png|jpeg|webp|svg+xml) URI under 512KB" }, { status: 413 });
  }

  await getOrCreateSettings();
  const db = getDb();
  const [row] = await db
    .update(settings)
    .set({
      company: payload.company,
      logo: payload.logo,
      typography: payload.typography,
      language: payload.language,
      updatedAt: new Date(),
    })
    .where(eq(settings.id, SINGLETON_ID))
    .returning();

  return json({ settings: row });
});
