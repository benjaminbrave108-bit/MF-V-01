import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { records } from "../../../db/schema";

export function fallbackKasaNameFor(kind: string): string {
  if (kind === "income") return "Diğer";
  if (kind === "expense") return "Diğer Giderler";
  return "";
}

// Mirrors the client's previous `ensureFallbackKasa`: if a record needs a
// default cash account bucket that doesn't exist yet as its own "cash"
// record, create one so it shows up in Kasalar.
export async function ensureFallbackKasa(name: string) {
  if (!name) return null;
  const db = getDb();
  const existing = await db
    .select()
    .from(records)
    .where(and(eq(records.kind, "cash"), eq(records.source, name)))
    .limit(1);
  if (existing[0]) return null;
  const [created] = await db
    .insert(records)
    .values({
      kind: "cash",
      date: new Date().toISOString().slice(0, 10),
      source: name,
      amount: 0,
    })
    .returning();
  return created;
}
