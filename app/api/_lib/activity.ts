import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { activityLog, cashAccounts, kasaSections } from "../../../db/schema";

// Son İşlemler günlüğü. Hiçbir zaman asıl işlemi bozmamalı: hatalar yutulur.
export type ActivityCategory = "income" | "expense" | "cash" | "workspace" | "user" | "report" | "note" | "auth" | "other";

type Actor = { id: number; name: string };

// Kasanın bağlı olduğu çalışma alanının adı (Diğer / Liste Kasaları / RJ-Kasaları / özel alan).
export async function workspaceOfKasa(kasaName: string | null | undefined): Promise<string> {
  if (!kasaName) return "";
  try {
    const db = getDb();
    const [row] = await db.select().from(cashAccounts).where(eq(cashAccounts.name, kasaName)).limit(1);
    if (!row) return "";
    if (row.sectionId != null) {
      const [section] = await db.select().from(kasaSections).where(eq(kasaSections.id, row.sectionId)).limit(1);
      if (section) return section.name;
    }
    if (row.isListWorkspace) return "Liste Kasaları";
    if (row.isRjKasa) return "RJ-Kasaları";
    return "Diğer";
  } catch {
    return "";
  }
}

// DELETE isteklerinde ?reason= ile gelen silme gerekçesi.
export function deleteReason(request: Request): string {
  return (new URL(request.url).searchParams.get("reason") ?? "").trim().slice(0, 500);
}
export const withReason = (summary: string, reason: string) => (reason ? `${summary} — Gerekçe: ${reason}` : summary);

export function formatAmount(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : "";
  const text = amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${text}` : `${currency} ${text}`;
}

export async function logActivity(
  user: Actor,
  entry: { category: ActivityCategory | (string & {}); action: string; summary: string; kasa?: string; workspace?: string; meta?: unknown },
): Promise<void> {
  try {
    const kasa = entry.kasa ?? "";
    const workspace = entry.workspace ?? (kasa ? await workspaceOfKasa(kasa) : "");
    await getDb().insert(activityLog).values({
      userId: user.id,
      userName: user.name,
      category: entry.category,
      action: entry.action,
      summary: entry.summary.slice(0, 500),
      kasa,
      workspace,
      meta: entry.meta ?? null,
    });
  } catch {
    // Günlük yazılamadıysa asıl işlem yine de başarılı sayılır.
  }
}
