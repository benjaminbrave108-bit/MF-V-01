ALTER TABLE "cash_accounts" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "kasa_sections" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "cash_workspace_order" jsonb DEFAULT '[]'::jsonb NOT NULL;