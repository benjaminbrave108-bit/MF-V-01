import { z, type ZodType } from "zod";
import { json } from "./http";
import { restrictablePages } from "./types";

// Shared body-parsing helper: reads JSON, validates against a zod schema,
// and returns either the typed data or a ready-to-return 400 Response with
// the field-level issues (never both). Route handlers do:
//   const parsed = await parseBody(request, recordInputSchema);
//   if ("response" in parsed) return parsed.response;
//   const payload = parsed.data;
export async function parseBody<T extends ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: json({ error: "Invalid request body" }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      response: json(
        { error: "Validation failed", issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

const kindSchema = z.enum(["cash", "income", "expense"]);
const currencySchema = z.enum(["USD", "IQD", "TRY", "EUR"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)");
const amountSchema = z.number().finite().min(0).max(999_999_999_999.99);
const shortText = (max: number) => z.string().max(max).optional().default("");
const tagsSchema = z.array(z.string().max(64)).max(20).optional().default([]);

export const recordInputSchema = z.object({
  kind: kindSchema,
  date: dateSchema,
  source: shortText(200),
  detail: shortText(2000),
  note: shortText(2000),
  person: shortText(200),
  amount: amountSchema,
  currency: currencySchema.optional().default("USD"),
  project: shortText(200),
  tags: tagsSchema,
  cashAccount: shortText(200),
  listName: shortText(200),
});

// PUT allows partial updates: unlike recordInputSchema's fields (which
// default a *missing* key to "" via .optional().default("")), every field
// here is plainly optional with no default, so an absent key parses to
// `undefined` and the route can fall back to the existing row's value
// (`payload.field ?? old.field`) instead of clobbering it with "".
export const recordUpdateSchema = z.object({
  kind: kindSchema.optional(),
  date: dateSchema.optional(),
  source: z.string().max(200).optional(),
  detail: z.string().max(2000).optional(),
  note: z.string().max(2000).optional(),
  person: z.string().max(200).optional(),
  amount: amountSchema.optional(),
  currency: currencySchema.optional(),
  project: z.string().max(200).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  cashAccount: z.string().max(200).optional(),
  listName: z.string().max(200).optional(),
  // Optimistic-locking token: the updatedAt the client last saw. If it
  // doesn't match the row's current value, someone else changed it first.
  updatedAt: z.string().optional(),
});

// An import row's date may be blank (the route then defaults it to today)
// but if present must still be a real YYYY-MM-DD date — plain
// z.string() here would let a malformed date like "16-01-2026" straight
// into the database unvalidated.
const importDateSchema = z.union([z.literal(""), dateSchema]);
export const recordImportSchema = z.object({
  items: z.array(recordInputSchema.partial({ date: true }).extend({ date: importDateSchema.optional().default("") })).min(1).max(2000),
});

export const cashTransferInputSchema = z.object({
  fromCashAccountId: z.number().int().positive(),
  // Exactly one of these: an existing kasa's id, or a brand new kasa's name.
  toCashAccountId: z.number().int().positive().optional(),
  toCashAccountName: z.string().max(200).optional(),
  amount: amountSchema.refine((n) => n > 0, "Amount must be greater than zero"),
  currency: currencySchema.optional().default("USD"),
  date: dateSchema,
  detail: shortText(2000),
  note: shortText(2000),
  recipientPerson: shortText(200),
  recipientUserId: z.number().int().positive().optional(),
});

const noteStatusSchema = z.enum(["important", "urgent", "pending", "completed"]);
const noteRelationSchema = z.enum(["none", "cash", "income", "expense", "reports", "archive", "other"]);

export const noteInputSchema = z.object({
  title: shortText(300),
  content: shortText(5000),
  status: noteStatusSchema.optional().default("important"),
  relation: noteRelationSchema.optional().default("none"),
  relationDetail: shortText(300),
});

export const commentInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  isAttention: z.boolean().optional().default(false),
});

export const reactionInputSchema = z.object({
  emoji: z.string().trim().min(1).max(8),
});

export const preparedReportInputSchema = z.object({
  id: z.string().max(100).optional(),
  date: shortText(20),
  title: shortText(300),
  detail: shortText(5000),
  presentedTo: shortText(200),
  cashAccount: shortText(200),
  signature: shortText(200),
  income: z.array(z.record(z.string(), z.unknown())).max(2000).optional().default([]),
  expense: z.array(z.record(z.string(), z.unknown())).max(2000).optional().default([]),
});

export const cashExpenseSheetInputSchema = z.object({
  kind: z.enum(["income", "expense"]),
  cashAccountName: shortText(200),
  startDate: shortText(20),
  endDate: shortText(20),
  budget: z.number().finite().min(0).default(0),
  reportReady: z.boolean().optional().default(false),
  reportDelivered: z.boolean().optional().default(false),
  reportDate: shortText(20),
  responsible: shortText(200),
  note: shortText(2000),
  resultNote: shortText(2000),
});

export const sheetCommentInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

const languageSchema = z.enum(["tr", "en", "ku"]);

export const settingsInputSchema = z.object({
  company: z.string().max(200).optional().default("Maliye-Finans"),
  logo: z.string().max(1_000_000).optional().default(""),
  typography: z.record(z.string(), z.unknown()).optional().default({}),
  language: languageSchema.optional().default("tr"),
});

const pageSchema = z.enum(restrictablePages as [string, ...string[]]);

export const userCreateSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1),
  name: z.string().max(200).optional().default(""),
  roleLabel: z.string().max(200).optional().default(""),
  isAdmin: z.boolean().optional().default(false),
  // Only actually applied when the requester is themself a super admin —
  // see app/api/users/route.ts. Accepted here so the request body can carry
  // it; authorization happens at the route, not the schema.
  isSuperAdmin: z.boolean().optional().default(false),
  permissions: z.array(pageSchema).max(restrictablePages.length).optional().default([]),
});

export const userUpdateSchema = z.object({
  password: z.string().optional().default(""),
  name: z.string().max(200).optional(),
  roleLabel: z.string().max(200).optional(),
  isAdmin: z.boolean().optional().default(false),
  isSuperAdmin: z.boolean().optional().default(false),
  permissions: z.array(pageSchema).max(restrictablePages.length).optional().default([]),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(200),
  avatar: z.string().max(1_000_000).optional().default(""),
  language: languageSchema.optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

// Ayarlar > Görüntüle (super admin only) — which other users' kasas get
// merged into this super admin's own Ana Sayfa totals.
export const dashboardScopeInputSchema = z.object({
  includedUserIds: z.array(z.number().int().positive()).max(500),
});

// GET /api/database/export produces exactly this shape; POST .../import
// validates against it. Loose on id/createdAt/updatedAt (ignored on
// import — the DB assigns fresh ones) but strict on the business fields.
const exportedRecordSchema = recordInputSchema.extend({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const exportedArchiveSchema = z.object({
  id: z.number().optional(),
  action: z.string().max(100),
  at: z.string().optional(),
  userName: z.string().max(200),
  oldRecord: z.record(z.string(), z.unknown()),
});
const exportedNoteSchema = noteInputSchema.extend({
  id: z.number().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const exportedReportSchema = preparedReportInputSchema.extend({
  createdAt: z.string().optional(),
});

export const databaseImportSchema = z.object({
  version: z.number().optional(),
  exportedAt: z.string().optional(),
  records: z.array(exportedRecordSchema).max(50_000).optional().default([]),
  archive: z.array(exportedArchiveSchema).max(50_000).optional().default([]),
  notes: z.array(exportedNoteSchema).max(20_000).optional().default([]),
  preparedReports: z.array(exportedReportSchema).max(20_000).optional().default([]),
  settings: z
    .object({
      company: z.string().max(200).optional(),
      logo: z.string().max(1_000_000).optional(),
      typography: z.record(z.string(), z.unknown()).optional(),
      language: languageSchema.optional(),
    })
    .nullable()
    .optional(),
});
