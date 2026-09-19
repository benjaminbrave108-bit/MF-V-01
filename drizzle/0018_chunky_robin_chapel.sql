ALTER TABLE "cash_expense_sheets" ADD COLUMN "kind" text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
CREATE INDEX "cash_expense_sheets_kind_idx" ON "cash_expense_sheets" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "cash_expense_sheets" ADD CONSTRAINT "cash_expense_sheets_kind_check" CHECK ("cash_expense_sheets"."kind" IN ('income', 'expense'));