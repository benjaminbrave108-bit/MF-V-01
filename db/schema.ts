import { boolean, check, index, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  roleLabel: text("role_label").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
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
}, (table) => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_at_idx").on(table.expiresAt),
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
  monthlyExpense: boolean("monthly_expense").notNull().default(false),
  cashAccount: text("cash_account").notNull().default(""),
  listName: text("list_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("records_kind_idx").on(table.kind),
  index("records_date_idx").on(table.date),
  index("records_cash_account_idx").on(table.cashAccount),
  check("records_kind_check", sql`${table.kind} IN ('cash', 'income', 'expense')`),
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

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  company: text("company").notNull().default("Maliye-Finans"),
  logo: text("logo").notNull().default(""),
  typography: jsonb("typography").notNull(),
  language: text("language").notNull().default("tr"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
