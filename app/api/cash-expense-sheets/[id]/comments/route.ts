import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { cashExpenseSheetComments, cashExpenseSheets } from "../../../../../db/schema";
import { requirePermission } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { parseBody, sheetCommentInputSchema } from "../../../_lib/validate";

async function requireVisibleSheetRow(request: Request, idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return { response: json({ error: "Invalid id" }, { status: 400 }) };
  const db = getDb();
  const rows = await db.select().from(cashExpenseSheets).where(eq(cashExpenseSheets.id, id)).limit(1);
  if (!rows[0]) return { response: json({ error: "Row not found" }, { status: 404 }) };
  const session = await requirePermission(request, rows[0].kind as "income" | "expense");
  if ("response" in session) return session;
  return { user: session.user, id, db };
}

export const GET = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireVisibleSheetRow(request, idParam);
  if ("response" in gate) return gate.response;

  const rows = await gate.db
    .select()
    .from(cashExpenseSheetComments)
    .where(eq(cashExpenseSheetComments.sheetRowId, gate.id))
    .orderBy(asc(cashExpenseSheetComments.createdAt), asc(cashExpenseSheetComments.id));

  return json({ comments: rows });
});

export const POST = withErrorHandling<{ params: Promise<{ id: string }> }>(async (request, { params }) => {
  const { id: idParam } = await params;
  const gate = await requireVisibleSheetRow(request, idParam);
  if ("response" in gate) return gate.response;

  const parsed = await parseBody(request, sheetCommentInputSchema);
  if ("response" in parsed) return parsed.response;

  const [comment] = await gate.db
    .insert(cashExpenseSheetComments)
    .values({
      sheetRowId: gate.id,
      userId: gate.user.id,
      userName: gate.user.name,
      text: parsed.data.text,
    })
    .returning();

  return json({ comment }, { status: 201 });
});
