ALTER TABLE "cash_accounts" ADD COLUMN "is_list_workspace" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "expense_record_id" integer;--> statement-breakpoint
-- Geri doldurma 1: çalışma alanı olan her kasa "Liste Kasası" olarak işaretlenir.
UPDATE "cash_accounts" SET "is_list_workspace" = true WHERE id IN (SELECT cash_account_id FROM "list_workspaces");
--> statement-breakpoint
-- Geri doldurma 2: gider tutarı olan her liste için bağlı kasada bir Gider kaydı oluştur.
INSERT INTO "records" ("kind", "date", "source", "detail", "note", "amount", "currency", "cash_account", "cash_account_id", "list_name", "list_id")
SELECT 'expense', l.date, l.name, 'Liste gideri · ' || l.code, l.note, l.amount,
  COALESCE((SELECT r2.currency FROM "records" r2 WHERE r2.cash_account_id = ca.id AND r2.kind IN ('cash', 'income') GROUP BY r2.currency ORDER BY count(*) DESC LIMIT 1), 'USD'),
  ca.name, ca.id, l.name, l.id
FROM "lists" l JOIN "cash_accounts" ca ON ca.id = l.cash_account_id
WHERE l.amount > 0 AND l.expense_record_id IS NULL;
--> statement-breakpoint
UPDATE "lists" l SET "expense_record_id" = r.id
FROM "records" r
WHERE r.list_id = l.id AND r.kind = 'expense' AND r.detail = 'Liste gideri · ' || l.code AND l.expense_record_id IS NULL;
