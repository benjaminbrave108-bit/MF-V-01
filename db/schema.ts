import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  // "Liste Kasası": Gelir/Kasa kaydında işaretlenen kasa Listeler sayfasında otomatik çalışma alanı olur.
  isListWorkspace: boolean("is_list_workspace").notNull().default(false),
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

// Proje Aşaması 2 — Liste defteri: bir liste (ör. "V listesi") bir çalışma
// alanına (ownerUserId = verinin sahibi) bağlıdır; tarihi, adı ve kodu vardır.
// Liste geliri/gideri `records` tablosunda gelir/gider kaydı olarak kalır
// (records.listId) — böylece Gelir, Gider, Kasalar ve Ana Sayfa toplamları
// kendiliğinden güncel kalır. Kişi (üye), dağıtım ve gider paylaşımı aşağıdaki
// tablolardadır. Bir liste tek para birimiyle çalışır.
export const lists = pgTable("lists", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  // Çalışma alanı = kasa: liste, bir kasanın (ör. "2026-V") altında yaşar.
  cashAccountId: integer("cash_account_id").references(() => cashAccounts.id, { onDelete: "cascade" }),
  // open | closed — kapalı listeye ürün eklenemez, sonuç sabitlenir.
  status: text("status").notNull().default("open"),
  // Listenin gider tutarı (çalışma alanı para biriminde) ve notu; alıcılara
  // dağılımı list_allocations'ta tutulur. Ürün satırları isteğe bağlı detaydır.
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  note: text("note").notNull().default(""),
  // Listenin gider tutarının Gider kaydı (records, kind=expense) olarak karşılığı — liste kaydedildikçe
  // senkronlanır, böylece Gider sayfası ve Kasalar bakiyesi kendiliğinden güncel kalır.
  expenseRecordId: integer("expense_record_id"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("lists_cash_account_code_idx").on(table.cashAccountId, table.code),
]);

// Çalışma alanı (Listeler): bir kasaya bağlı kayıt; listeler, alıcılar bunun altında yaşar.
// amount boşsa (null) alanın geliri kasadan otomatik hesaplanır; doluysa elle girilen tutar kullanılır.
export const listWorkspaces = pgTable("list_workspaces", {
  id: serial("id").primaryKey(),
  cashAccountId: integer("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("list_workspaces_cash_account_idx").on(table.cashAccountId),
]);

// Çalışma alanındaki (kasa) liste alıcıları: kasadan para dağıtılan ve listelerdeki
// ürünleri alan kişiler.
export const workspaceRecipients = pgTable("workspace_recipients", {
  id: serial("id").primaryKey(),
  cashAccountId: integer("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("workspace_recipients_cash_account_id_idx").on(table.cashAccountId),
]);

// Çalışma alanı kasasından bir alıcıya yapılan dağıtım.
export const workspaceDistributions = pgTable("workspace_distributions", {
  id: serial("id").primaryKey(),
  cashAccountId: integer("cash_account_id").notNull().references(() => cashAccounts.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => workspaceRecipients.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
  date: text("date").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("workspace_distributions_cash_account_id_idx").on(table.cashAccountId),
]);

// Bir liste giderinin alıcılara dağılımı (liste başına alıcı başına tek satır).
export const listAllocations = pgTable("list_allocations", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => workspaceRecipients.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
}, (table) => [
  uniqueIndex("list_allocations_list_recipient_idx").on(table.listId, table.recipientId),
]);

// Listenin ürün satırları; tutar = adet × birim fiyat, her ürünün bir alıcısı.
export const listItems = pgTable("list_items", {
  id: serial("id").primaryKey(),
  listId: integer("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  name: text("name").notNull().default(""),
  quantity: numeric("quantity", { precision: 14, scale: 3, mode: "number" }).notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  recipientId: integer("recipient_id").references(() => workspaceRecipients.id, { onDelete: "set null" }),
  note: text("note").notNull().default(""),
}, (table) => [
  index("list_items_list_id_idx").on(table.listId),
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
  // Proje Aşaması 2: kaydın bağlı olduğu liste (listName, listenin adının
  // kopyası olarak kalır — eski ekranlar ve raporlar onu kullanmaya devam eder).
  listId: integer("list_id").references(() => lists.id, { onDelete: "set null" }),
  // Bir kayda eklenen Excel/Office/PDF dosyaları (birden fazla olabilir) —
  // avatar/logo ile aynı desen: her biri base64 data URL olarak doğrudan
  // saklanır (ayrı bir dosya depolama/S3 entegrasyonu yok). Dizi elemanı:
  // { name: string; data: string }.
  attachments: jsonb("attachments").notNull().default([]),
  // Gider formundaki "Gider Detaylarını Görüntüle" bölümü: Excel/Google
  // Sheets'ten kopyalanıp yapıştırılan tablo — satırlar × hücreler (metin).
  // İlk satır başlık olarak gösterilir.
  detailTable: jsonb("detail_table").notNull().default([]),
  // Detay tablosunun görünümü: kullanıcının sürükleyerek ayarladığı sütun
  // genişlikleri ve satır yükseklikleri (px). { cols: number[]; rows: number[] }
  detailTableLayout: jsonb("detail_table_layout").notNull().default({}),
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

// A whole comment THREAD (every comment on one record) archived out of the
// main Yorumlar list at once — presence of a row = that record's thread is
// archived. Kept separate from record_comments itself since archiving is a
// per-thread action, not a per-comment one (see Comments.tsx "Arşivle").
export const commentThreadArchives = pgTable("comment_thread_archives", {
  recordId: integer("record_id").notNull().references(() => records.id, { onDelete: "cascade" }).primaryKey(),
  archivedByUserId: integer("archived_by_user_id").references(() => users.id, { onDelete: "set null" }),
  archivedByName: text("archived_by_name").notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  // Bu notla ilgilenmesi/görmesi gereken kullanıcılar (birden fazla olabilir)
  // — Notlar panosunda ve kartlarda gösterilir, bildirim/rozet mantığıyla
  // doğrudan bağlantılı değil (herkes tüm notların okunmamış sayısını
  // görür). users.dashboardIncludedUserIds ile aynı desen: FK bütünlüğü
  // yerine basit bir id dizisi — bir kullanıcı silinirse dizide kalan id
  // sessizce göz ardı edilir (bkz. app/api/notes/route.ts'teki isim eşleme).
  assignedUserIds: jsonb("assigned_user_ids").notNull().default([]),
  // "Arşivle" — elle tetiklenen bir eylem; arşivlenen not Notlar panosundan
  // kaybolup Arşiv > Notlar Arşivi bölümünde kalıcı olarak görünür kalır.
  // Bu, panonun zamanla birikip kalabalıklaşmasını (kullanıcının bahsettiği
  // "birikme") önlemek için var.
  isArchived: boolean("is_archived").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("finance_notes_status_check", sql`${table.status} IN ('important', 'urgent', 'pending', 'completed')`),
]);

// Per-user "read up to" marker for one finance note — aynı commentReads
// deseni, "Mali Özel Notlar" rozetini (sidebar'daki okunmamış say) besler.
// Notu görüntülemek (Notlar sayfasını açmak) bu satırı şimdiye günceller;
// not.updatedAt bundan daha yeniyse (yeniden düzenlendiyse) hâlâ okunmamış
// sayılır.
export const noteReads = pgTable("note_reads", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  noteId: integer("note_id").notNull().references(() => financeNotes.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.noteId] }),
  index("note_reads_user_id_idx").on(table.userId),
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
