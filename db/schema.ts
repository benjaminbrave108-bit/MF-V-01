import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  roleLabel: text("role_label").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  // Super admins are a small subset of admins (typically 1-2 people) who see
  // every kasa unconditionally and manage kasa-level access grants in
  // Ayarlar > Kasa Erişimi. A plain admin only sees kasas they own or were
  // granted — see cashAccounts/cashAccountAccess below.
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  permissions: jsonb("permissions").notNull().default([]),
  avatar: text("avatar").notNull().default(""),
  // Per-user UI language — takes over from settings.language once signed
  // in (that column stays only as the pre-login default). Set via the
  // navbar language picker (PUT /api/profile) or LanguageSetup at first run.
  language: text("language").notNull().default("tr"),
  // Set automatically after repeated failed login attempts against this
  // account; only an admin can clear it (see app/api/_lib/security.ts).
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockReason: text("lock_reason").notNull().default(""),
  // Super-admin-only "Görüntüle" preference (Ayarlar): other users' ids
  // whose kasas should be merged into *this* super admin's own Ana Sayfa
  // totals (Toplam Gelir/Gider/Net/Bakiye). Empty means Ana Sayfa stays
  // limited to their own data — see dashboardCashAccountIds in page.tsx.
  // Meaningless for a non-super-admin account.
  dashboardIncludedUserIds: jsonb("dashboard_included_user_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// IPs auto-blocked after repeated failed login attempts. Presence of a row
// means "blocked" — only an admin removing the row lifts it.
export const blockedIps = pgTable("blocked_ips", {
  ip: text("ip").primaryKey(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Bumped (throttled, at most every ~30s) on every authenticated request
  // that resolves this session — see getSessionUser in app/api/_lib/auth.ts.
  // Powers Kullanıcılar' online/offline dot: a user counts as online while
  // this is within the last couple of minutes.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
]);

// A kasa (cash account) as a first-class entity, decoupled from the
// `records.source` string match the app used to rely on exclusively. The
// `records` row with kind='cash' is still what carries the kasa's own
// opening/adjustment amount (unchanged), but access control now hangs off
// this table + cashAccountAccess below rather than off free-text names.
export const cashAccounts = pgTable("cash_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  // Owner-controlled opt-in (Kasalar > Paylaş, or Ayarlar > Paylaşım): when
  // true, a super admin may fold this kasa's totals into their own Ana
  // Sayfa via Ayarlar > Görüntüle (see users.dashboardIncludedUserIds).
  // Independent of cashAccountAccess — a kasa can be shared for viewing
  // without ever appearing in anyone's dashboard aggregate, and vice versa.
  dashboardShareEnabled: boolean("dashboard_share_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Grants: presence of a row = that user can see this kasa (and its
// linked income/expense records). Super admins bypass this table entirely
// (see requireCashAccountAccess in app/api/_lib/cash-access.ts).
export const cashAccountAccess = pgTable("cash_account_access", {
  cashAccountId: integer("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.cashAccountId, table.userId] }),
  index("cash_account_access_cash_account_id_idx").on(table.cashAccountId),
  index("cash_account_access_user_id_idx").on(table.userId),
]);

export const records = pgTable("records", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  date: text("date").notNull(),
  source: text("source").notNull().default(""),
  detail: text("detail").notNull().default(""),
  note: text("note").notNull().default(""),
  person: text("person").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  project: text("project").notNull().default(""),
  tags: jsonb("tags").notNull().default([]),
  cashAccount: text("cash_account").notNull().default(""),
  // Nullable so legacy/orphan rows (a kasa name with no matching
  // cash_accounts row, which shouldn't happen after the 0007 migration's
  // backfill but is not worth a hard constraint over) don't block writes.
  cashAccountId: integer("cash_account_id").references(() => cashAccounts.id, { onDelete: "set null" }),
  listName: text("list_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("records_kind_idx").on(table.kind),
  index("records_date_idx").on(table.date),
  index("records_cash_account_id_idx").on(table.cashAccountId),
  index("records_cash_account_idx").on(table.cashAccount),
  check("records_kind_check", sql`${table.kind} IN ('cash', 'income', 'expense')`),
]);

// A pending money movement between two kasas. Creating one does NOT touch
// either kasa's balance — only when the recipient side confirms (POST
// /api/cash-transfers/:id/confirm) do the two ledger `records` rows
// (fromRecordId/toRecordId) get created, which is what actually moves the
// amount out of the sender's kasa and into the target one. See "Kasa
// Aktarımı" in the kasa edit modal (app/components/Records.tsx).
export const cashTransfers = pgTable("cash_transfers", {
  id: serial("id").primaryKey(),
  fromCashAccountId: integer("from_cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  toCashAccountId: integer("to_cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
  currency: text("currency").notNull().default("USD"),
  date: text("date").notNull(),
  detail: text("detail").notNull().default(""),
  note: text("note").notNull().default(""),
  recipientPerson: text("recipient_person").notNull().default(""),
  recipientUserId: integer("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // The two ledger rows created on confirm — a negative "cash" record on the
  // source kasa, a positive one on the target kasa. Null while pending.
  fromRecordId: integer("from_record_id").references(() => records.id, { onDelete: "set null" }),
  toRecordId: integer("to_record_id").references(() => records.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cash_transfers_from_idx").on(table.fromCashAccountId),
  index("cash_transfers_to_idx").on(table.toCashAccountId),
  index("cash_transfers_status_idx").on(table.status),
  check("cash_transfers_status_check", sql`${table.status} IN ('pending', 'confirmed', 'cancelled')`),
]);

// A discussion thread attached to one records row (Kasalar/Gelir/Gider).
// Added from the "💬" action on that record's row, or replied to from
// Mali Özel Notlar > Yorumlar, which lists every record that has at least
// one comment as a card — same thread, two entry points.
export const recordComments = pgTable("record_comments", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  text: text("text").notNull(),
  // "⚠️ Dikkat" — the author flags this comment as needing attention; such
  // comments get a warning style wherever they render and are what Yorumlar
  // > "Dikkat Yorumları" filters down to (see app/components/Comments.tsx).
  isAttention: boolean("is_attention").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("record_comments_record_id_idx").on(table.recordId),
]);

// One user's emoji reaction on one comment — presence of a row = reacted,
// same "presence-as-state" pattern as cashAccountAccess. The composite key
// lets the same user drop several different emoji on one comment, but never
// the same emoji twice (the POST toggles: exists → delete, absent → insert).
export const commentReactions = pgTable("comment_reactions", {
  commentId: integer("comment_id").notNull().references(() => recordComments.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.commentId, table.userId, table.emoji] }),
  index("comment_reactions_comment_id_idx").on(table.commentId),
]);

// Per-user "read up to" marker for one record's comment thread — powers the
// unread-count badge next to "Yorumlar" in the sidebar (see
// app/api/comments/unread-count). Opening a thread (its modal or its card
// on the Yorumlar page) upserts this row to now; any comment on that record
// newer than lastReadAt, written by someone else, still counts as unread.
export const commentReads = pgTable("comment_reads", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recordId: integer("record_id").notNull().references(() => records.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.recordId] }),
  index("comment_reads_user_id_idx").on(table.userId),
]);

export const archive = pgTable("archive", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userName: text("user_name").notNull(),
  oldRecord: jsonb("old_record").notNull(),
}, (table) => [
  index("archive_at_idx").on(table.at.desc()),
]);

export const financeNotes = pgTable("finance_notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull(),
  relation: text("relation").notNull().default("none"),
  relationDetail: text("relation_detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("finance_notes_status_check", sql`${table.status} IN ('important', 'urgent', 'pending', 'completed')`),
]);

export const preparedReports = pgTable("prepared_reports", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  presentedTo: text("presented_to").notNull().default(""),
  cashAccount: text("cash_account").notNull().default(""),
  signature: text("signature").notNull().default(""),
  income: jsonb("income").notNull().default([]),
  expense: jsonb("expense").notNull().default([]),
});

// Gelir > Gelir Çizelgesi / Gider > Gider Çizelgesi: one row per kasa/project
// being tracked against a manually-entered budget, tagged 'income' or
// 'expense' by `kind` so the same table backs both pages. Actual spend/income
// and the per-person breakdown are NOT stored here — they are computed
// client-side, live, from `records` (kind=this row's kind, cashAccount =
// cashAccountName, grouped by person) so the sheet never drifts from the
// underlying ledger.
export const cashExpenseSheets = pgTable("cash_expense_sheets", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("expense"),
  // Short display code (e.g. "26-01"), assigned once at creation time.
  code: text("code").notNull().default(""),
  cashAccountId: integer("cash_account_id").references(() => cashAccounts.id, { onDelete: "set null" }),
  cashAccountName: text("cash_account_name").notNull().default(""),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  budget: numeric("budget", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  // true (default): budget is auto-summed from records in [startDate,
  // endDate] (or the kasa's own amount when no range is set) — see
  // CashExpenseSheetModal's auto-recompute effect. false: the user typed
  // it in and it's never overwritten automatically.
  budgetAuto: boolean("budget_auto").notNull().default(true),
  reportReady: boolean("report_ready").notNull().default(false),
  reportDelivered: boolean("report_delivered").notNull().default(false),
  reportDate: text("report_date").notNull().default(""),
  responsible: text("responsible").notNull().default(""),
  note: text("note").notNull().default(""),
  resultNote: text("result_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cash_expense_sheets_cash_account_id_idx").on(table.cashAccountId),
  index("cash_expense_sheets_cash_account_name_idx").on(table.cashAccountName),
  index("cash_expense_sheets_kind_idx").on(table.kind),
  check("cash_expense_sheets_kind_check", sql`${table.kind} IN ('income', 'expense')`),
]);

// A simple (no reactions/attention-flag) comment thread attached to one
// Kasa Gider Çizelgesi row — the "Detay" section's "Yorum" entry point.
// Deliberately a separate table from record_comments rather than reusing it:
// recordComments.recordId is a FK to records.id, and a sheet row is not a
// records row.
export const cashExpenseSheetComments = pgTable("cash_expense_sheet_comments", {
  id: serial("id").primaryKey(),
  sheetRowId: integer("sheet_row_id").notNull().references(() => cashExpenseSheets.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  userName: text("user_name").notNull().default(""),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("cash_expense_sheet_comments_sheet_row_id_idx").on(table.sheetRowId),
]);

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  company: text("company").notNull().default("Maliye-Finans"),
  logo: text("logo").notNull().default(""),
  typography: jsonb("typography").notNull(),
  language: text("language").notNull().default("tr"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
