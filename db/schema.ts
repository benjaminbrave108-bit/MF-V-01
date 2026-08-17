import { boolean, index, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  roleLabel: text("role_label").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  permissions: jsonb("permissions").notNull().default([]),
  avatar: text("avatar").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
]);

export const archive = pgTable("archive", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userName: text("user_name").notNull(),
  oldRecord: jsonb("old_record").notNull(),
});

export const financeNotes = pgTable("finance_notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull(),
  relation: text("relation").notNull().default("none"),
  relationDetail: text("relation_detail").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
