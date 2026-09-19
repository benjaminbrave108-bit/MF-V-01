export type Kind = "cash" | "income" | "expense";
export type Page =
  | "dashboard"
  | Kind
  | "reportBuilder"
  | "notes"
  | "comments"
  | "archive"
  | "users"
  | "settings";
export type RecordItem = {
  id: number;
  kind: Kind;
  date: string;
  source: string;
  detail: string;
  note: string;
  person: string;
  amount: number;
  currency: string;
  project: string;
  tags: string[];
  cashAccount: string;
  listName: string;
  // The kasa this record is actually linked to (FK) — null for legacy/orphan
  // rows. Used client-side to scope a record to a "workspace" (own vs a
  // shared user's) by matching against CashAccountSummary.id; cashAccount
  // above is only the display-text name.
  cashAccountId?: number | null;
  // Sent back with edits so the server can detect a concurrent change
  // (see saveRecord's 409 handling) — meaningless on a not-yet-saved record.
  updatedAt?: string;
};
export type ArchiveItem = {
  id: number;
  action: "Düzenlendi" | "Silindi";
  at: string;
  user: string;
  old: RecordItem;
};
export type NoteStatus = "important" | "urgent" | "pending" | "completed";
export type NoteRelation = "none" | "cash" | "income" | "expense" | "reports" | "archive" | "other";
export type FinanceNote = {
  id: number;
  title: string;
  content: string;
  status: NoteStatus;
  relation: NoteRelation;
  relationDetail: string;
  createdAt: string;
  updatedAt: string;
};
export type Language = "tr" | "en" | "ku";
export type Profile = {
  name: string;
  username: string;
  role: string;
  avatar: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: Page[];
  // Ayarlar > Görüntüle (super admin only) — other users' ids whose kasas
  // are merged into this super admin's own Ana Sayfa totals.
  dashboardIncludedUserIds: number[];
};
export type UserAccount = {
  id: number;
  name: string;
  username: string;
  roleLabel: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: Page[];
  locked: boolean;
  lockedAt: string | null;
  lockReason: string;
};
export type BlockedIp = { ip: string; reason: string; createdAt: string };
// Kasa Erişimi (Ayarlar) taslağının veri modeli — bkz. app/api/cash-accounts.
export type CashAccountSummary = {
  id: number;
  name: string;
  ownerUserId: number | null;
  ownerName?: string | null;
  createdAt?: string;
  isOwner: boolean;
  sharedWithUserIds: number[];
  // Owner-controlled opt-in (Kasalar > Paylaş or Ayarlar > Paylaşım): lets a
  // super admin fold this kasa into their own Ana Sayfa via Görüntüle.
  dashboardShareEnabled: boolean;
};
// Kasa Aktarımı: bkz. app/api/cash-transfers. Oluşturulduğu anda kaynak
// kasadan tutar hemen düşer ve hedef kasada "gelir" kaydı hemen görünür
// (fromRecordId/toRecordId) — status yalnızca hedef kasadaki kaydın "Onay
// Bekliyor" (soluk renk) mü yoksa onaylanmış mı göründüğünü belirler. Hedef
// kasaya erişimi olan taraf onaylayınca (POST .../:id/confirm) status
// "confirmed" olur; ödeme o an değil, oluşturulduğu anda gerçekleşmiştir.
export type CashTransferStatus = "pending" | "confirmed" | "cancelled";
export type CashTransfer = {
  id: number;
  fromCashAccountId: number;
  fromCashAccountName: string;
  toCashAccountId: number;
  toCashAccountName: string;
  amount: number;
  currency: string;
  date: string;
  detail: string;
  note: string;
  recipientPerson: string;
  recipientUserId: number | null;
  recipientUserName: string | null;
  createdByUserId: number;
  createdByUserName: string;
  status: CashTransferStatus;
  confirmedByUserId: number | null;
  confirmedByUserName: string | null;
  confirmedAt: string | null;
  fromRecordId: number | null;
  toRecordId: number | null;
  createdAt: string;
};
export const restrictablePages: Page[] = ["cash", "income", "expense", "reportBuilder", "notes", "comments", "archive"];
// A comment thread on one records row — added from the "💬" action on its
// Kasalar/Gelir/Gider row, or replied to from Mali Özel Notlar > Yorumlar
// (see Comments.tsx), which lists every record that has at least one.
export type CommentReaction = { emoji: string; count: number; mine: boolean };
export type RecordComment = {
  id: number;
  recordId: number;
  userId: number | null;
  userName: string;
  text: string;
  isAttention: boolean;
  createdAt: string;
  reactions: CommentReaction[];
};
// "users" is intentionally not here — every signed-in user may open
// Kullanıcılar to view/edit their own account; Users.tsx itself restricts
// non-admins to just their own card and a name/password-only edit form.
export const adminOnlyPages: Page[] = ["settings"];
export type ReportLine = { date: string; title: string; detail: string; note: string; amount: number };
export type PreparedReport = {
  id: string;
  createdAt: string;
  date: string;
  title: string;
  detail: string;
  presentedTo: string;
  cashAccount: string;
  signature: string;
  income: ReportLine[];
  expense: ReportLine[];
};
// Gelir Çizelgesi / Gider Çizelgesi row — see db/schema.ts's cashExpenseSheets
// for why the actual-spend/income and per-person breakdown are NOT part of
// this type: they are derived client-side from RecordItem[], never stored.
export type CashExpenseSheetRow = {
  id: number;
  kind: "income" | "expense";
  code: string;
  cashAccountName: string;
  startDate: string;
  endDate: string;
  budget: number;
  reportReady: boolean;
  reportDelivered: boolean;
  reportDate: string;
  responsible: string;
  note: string;
  resultNote: string;
  createdAt: string;
  updatedAt?: string;
};
// Kasa Gider Çizelgesi row's "Yorum" thread — simpler than RecordComment
// (no reactions, no attention flag), see db/schema.ts's cashExpenseSheetComments.
export type CashExpenseSheetComment = {
  id: number;
  sheetRowId: number;
  userId: number | null;
  userName: string;
  text: string;
  createdAt: string;
};
export type TypographyKey = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "tableHeader" | "formText";
export type TypographyRule = { size: number; font: string; color: string };
export type TypographySettings = Record<TypographyKey, TypographyRule>;
