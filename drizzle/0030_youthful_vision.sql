-- Eski liste üyelerini, listenin kasasındaki (çalışma alanı) alıcılara taşı.
INSERT INTO "workspace_recipients" ("cash_account_id", "name")
SELECT DISTINCT l.cash_account_id, m.name FROM "list_members" m JOIN "lists" l ON l.id = m.list_id WHERE l.cash_account_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "list_distributions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "list_expense_shares" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "list_members" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "list_distributions" CASCADE;--> statement-breakpoint
DROP TABLE "list_expense_shares" CASCADE;--> statement-breakpoint
DROP TABLE "list_members" CASCADE;--> statement-breakpoint
ALTER TABLE "lists" DROP CONSTRAINT "lists_owner_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "lists_owner_code_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "lists_cash_account_code_idx" ON "lists" USING btree ("cash_account_id","code");--> statement-breakpoint
ALTER TABLE "lists" DROP COLUMN "owner_user_id";