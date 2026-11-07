CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"user_name" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"kasa" text DEFAULT '' NOT NULL,
	"workspace" text DEFAULT '' NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "activity_log_at_idx" ON "activity_log" USING btree ("at" DESC NULLS LAST);