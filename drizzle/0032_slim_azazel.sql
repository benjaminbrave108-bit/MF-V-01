CREATE TABLE "list_workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"cash_account_id" integer NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2),
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_workspaces" ADD CONSTRAINT "list_workspaces_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_workspaces_cash_account_idx" ON "list_workspaces" USING btree ("cash_account_id");--> statement-breakpoint
-- Geri doldurma: listesi veya alıcısı olan her kasa için bir çalışma alanı kaydı.
INSERT INTO "list_workspaces" ("cash_account_id")
SELECT DISTINCT cash_account_id FROM (
  SELECT cash_account_id FROM "lists" WHERE cash_account_id IS NOT NULL
  UNION
  SELECT cash_account_id FROM "workspace_recipients"
) k
ON CONFLICT DO NOTHING;
