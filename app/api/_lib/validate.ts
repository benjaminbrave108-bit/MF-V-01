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
  monthlyExpense: z.boolean().optional().default(false),
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
  monthlyExpense: z.boolean().optional(),
  cashAccount: z.string().max(200).optional(),
  listName: z.string().max(200).optional(),
  // Optimistic-locking token: the updatedAt the client last saw. If it
  // doesn't match the row's current value, someone else changed it first.
  updatedAt: z.string().optional(),
});

export const recordImportSchema = z.object({
  items: z.array(recordInputSchema.partial({ date: true }).extend({ date: z.string().optional().default("") })).min(1).max(2000),
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
  permissions: z.array(pageSchema).max(restrictablePages.length).optional().default([]),
});

export const userUpdateSchema = z.object({
  password: z.string().optional().default(""),
  name: z.string().max(200).optional(),
  roleLabel: z.string().max(200).optional(),
  isAdmin: z.boolean().optional().default(false),
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
