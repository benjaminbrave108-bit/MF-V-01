import { z } from "zod";
import { getDb } from "../../../../../db";
import { cashAccounts } from "../../../../../db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "../../../_lib/auth";
import { canManageCashAccountAccess, grantCashAccountAccess, revokeCashAccountAccess } from "../../../_lib/cash-access";
import { json, withErrorHandling } from "../../../_lib/http";
import { parseBody } from "../../../_lib/validate";

const accessBodySchema = z.object({ userId: z.number().int().positive() });

async function requireManageableKasa(request: Request, idParam: string) {
  const session = await requireSession(request);
  if ("response" in session) return session;
  const id = Number(idParam);
  if (!Number.isFinite(id)) return { response: json({ error: "Invalid id" }, { status: 400 }) };
  const db = getDb();
  const existing = await db.select({ id: cashAccounts.id }).from(cashAccounts).where(eq(cashAccounts.id, id)).limit(1);
  if (!existing[0]) return { response: json({ error: "Kasa not found" }, { status: 404 }) };
  if (!(await canManageCashAccountAccess(session.user, id, db))) return { response: json({ error: "Forbidden" }, { status: 403 }) };
  return { user: session.user, id, db };
}

export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireManageableKasa(request, idParam);
  if ("response" in gate) return gate.response;

  const parsed = await parseBody(request, accessBodySchema);
  if ("response" in parsed) return parsed.response;

  await grantCashAccountAccess(gate.id, parsed.data.userId, gate.db);
  return json({ ok: true }, { status: 201 });
});

export const DELETE = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireManageableKasa(request, idParam);
  if ("response" in gate) return gate.response;

  const url = new URL(request.url);
  const userId = Number(url.searchParams.get("userId"));
  if (!Number.isFinite(userId)) return json({ error: "userId query param is required" }, { status: 400 });

  await revokeCashAccountAccess(gate.id, userId, gate.db);
  return json({ ok: true });
});
