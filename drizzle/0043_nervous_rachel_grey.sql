ALTER TABLE "settings" ADD COLUMN "auto_exchange_rates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "auto_exchange_rates_date" text;