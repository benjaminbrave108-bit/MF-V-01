ALTER TABLE "records" ADD COLUMN "debt_role" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "debt_cash_account_id" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "debt_link_id" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "debt_meta" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX "records_debt_pair_idx" ON "records" USING btree ("debt_role","cash_account_id","debt_cash_account_id");