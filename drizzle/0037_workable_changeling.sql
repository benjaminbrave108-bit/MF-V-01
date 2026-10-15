CREATE TABLE "kasa_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#7b52bf' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kasa_sections_scope_check" CHECK ("kasa_sections"."scope" IN ('cash', 'income', 'expense'))
);
--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD COLUMN "section_id" integer;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "section_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "kasa_sections_scope_name_idx" ON "kasa_sections" USING btree ("scope","name");