export type Kind = "cash" | "income" | "expense";
export type Page =
  | "dashboard"
  | Kind
  | "reportBuilder"
  | "notes"
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
  monthlyExpense: boolean;
  cashAccount: string;
  listName: string;
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
export type Profile = { name: string; username: string; role: string; avatar: string; isAdmin: boolean; permissions: Page[] };
export type UserAccount = {
  id: number;
  name: string;
  username: string;
  roleLabel: string;
  isAdmin: boolean;
  permissions: Page[];
  locked: boolean;
  lockedAt: string | null;
  lockReason: string;
};
export type BlockedIp = { ip: string; reason: string; createdAt: string };
export const restrictablePages: Page[] = ["cash", "income", "expense", "reportBuilder", "notes", "archive"];
export const adminOnlyPages: Page[] = ["users", "settings"];
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
export type TypographyKey = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "tableHeader" | "formText";
export type TypographyRule = { size: number; font: string; color: string };
export type TypographySettings = Record<TypographyKey, TypographyRule>;
