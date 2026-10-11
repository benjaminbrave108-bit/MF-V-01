CREATE TABLE "list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"quantity" numeric(14, 3) DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"recipient_id" integer,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"cash_account_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"cash_account_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "cash_account_id" integer;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_recipient_id_workspace_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."workspace_recipients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_distributions" ADD CONSTRAINT "workspace_distributions_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_distributions" ADD CONSTRAINT "workspace_distributions_recipient_id_workspace_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."workspace_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_recipients" ADD CONSTRAINT "workspace_recipients_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_items_list_id_idx" ON "list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "workspace_distributions_cash_account_id_idx" ON "workspace_distributions" USING btree ("cash_account_id");--> statement-breakpoint
CREATE INDEX "workspace_recipients_cash_account_id_idx" ON "workspace_recipients" USING btree ("cash_account_id");--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Geri doldurma: mevcut listeleri, kayıtlarının kasasına (yoksa sahibinin ilk kasasına) bağla.
UPDATE "lists" l SET "cash_account_id" = COALESCE(
  (SELECT r.cash_account_id FROM "records" r WHERE r.list_id = l.id AND r.cash_account_id IS NOT NULL ORDER BY r.id LIMIT 1),
  (SELECT ca.id FROM "cash_accounts" ca WHERE ca.owner_user_id = l.owner_user_id ORDER BY ca.id LIMIT 1)
);
