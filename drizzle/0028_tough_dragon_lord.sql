CREATE TABLE "list_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_expense_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"owner_user_id" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "list_id" integer;--> statement-breakpoint
ALTER TABLE "list_distributions" ADD CONSTRAINT "list_distributions_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_distributions" ADD CONSTRAINT "list_distributions_member_id_list_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."list_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_expense_shares" ADD CONSTRAINT "list_expense_shares_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_expense_shares" ADD CONSTRAINT "list_expense_shares_member_id_list_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."list_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_distributions_list_id_idx" ON "list_distributions" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_expense_shares_record_id_idx" ON "list_expense_shares" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "list_expense_shares_record_member_idx" ON "list_expense_shares" USING btree ("record_id","member_id");--> statement-breakpoint
CREATE INDEX "list_members_list_id_idx" ON "list_members" USING btree ("list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_owner_code_idx" ON "lists" USING btree ("owner_user_id","code");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Proje Aşaması 2 geri doldurma: records.list_name değerlerinden liste oluştur.
INSERT INTO "lists" ("code", "name", "date", "owner_user_id", "currency")
SELECT
  'L-' || lpad(row_number() OVER (PARTITION BY g.owner_id ORDER BY g.first_date, g.list_name)::text, 3, '0'),
  g.list_name,
  g.first_date,
  g.owner_id,
  g.currency
FROM (
  SELECT
    r.list_name,
    COALESCE(ca.owner_user_id, (SELECT min(id) FROM users)) AS owner_id,
    min(r.date) AS first_date,
    min(r.currency) AS currency
  FROM "records" r
  LEFT JOIN "cash_accounts" ca ON ca.id = r.cash_account_id
  WHERE r.list_name <> ''
  GROUP BY r.list_name, COALESCE(ca.owner_user_id, (SELECT min(id) FROM users))
) g;
--> statement-breakpoint
UPDATE "records" r SET "list_id" = l.id
FROM "lists" l
WHERE r.list_name <> '' AND l.name = r.list_name
  AND l.owner_user_id IS NOT DISTINCT FROM COALESCE((SELECT owner_user_id FROM "cash_accounts" WHERE id = r.cash_account_id), (SELECT min(id) FROM users));
