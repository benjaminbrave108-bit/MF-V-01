CREATE TABLE "cash_account_access" (
	"cash_account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_account_access_cash_account_id_user_id_pk" PRIMARY KEY("cash_account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "cash_account_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_account_access" ADD CONSTRAINT "cash_account_access_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_account_access" ADD CONSTRAINT "cash_account_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_account_access_cash_account_id_idx" ON "cash_account_access" USING btree ("cash_account_id");--> statement-breakpoint
CREATE INDEX "cash_account_access_user_id_idx" ON "cash_account_access" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "records_cash_account_id_idx" ON "records" USING btree ("cash_account_id");--> statement-breakpoint
-- Backfill (hand-written, not drizzle-kit generated): promote existing
-- kasa names into first-class cash_accounts rows, link every record to its
-- kasa, designate the initial super admin, and grandfather everyone who
-- currently has blanket visibility into every existing kasa so nobody's
-- access silently narrows at deploy time. Kasa-level scoping only bites for
-- users who aren't grandfathered here and for kasas created from now on.
-- 1) Designate the initial super admin: the 'admin' account if present,
-- otherwise the lowest-id admin account, otherwise nobody (operator sets
-- one by hand via SQL — there is no admin account at all in that case).
UPDATE "users" SET "is_super_admin" = true
WHERE "id" = COALESCE(
  (SELECT "id" FROM "users" WHERE "username" = 'admin' LIMIT 1),
  (SELECT "id" FROM "users" WHERE "is_admin" = true ORDER BY "id" ASC LIMIT 1)
);--> statement-breakpoint
-- 2) One cash_accounts row per distinct existing kasa name (kind='cash'
-- records' source), owned by the new super admin.
INSERT INTO "cash_accounts" ("name", "owner_user_id")
SELECT DISTINCT r."source", (SELECT "id" FROM "users" WHERE "is_super_admin" = true ORDER BY "id" ASC LIMIT 1)
FROM "records" r
WHERE r."kind" = 'cash' AND r."source" <> ''
ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- 3) Link every record to its kasa: kind='cash' rows match by their own
-- source; income/expense rows match by their cash_account text field.
UPDATE "records" r SET "cash_account_id" = ca."id"
FROM "cash_accounts" ca
WHERE r."kind" = 'cash' AND ca."name" = r."source" AND r."cash_account_id" IS NULL;--> statement-breakpoint
UPDATE "records" r SET "cash_account_id" = ca."id"
FROM "cash_accounts" ca
WHERE r."kind" IN ('income', 'expense') AND ca."name" = r."cash_account" AND r."cash_account_id" IS NULL AND r."cash_account" <> '';--> statement-breakpoint
-- 4) Grandfather: every admin, and every non-admin who already had page-level
-- access to at least one of cash/income/expense, keeps seeing every
-- existing kasa. New kasas created after this migration are NOT auto-shared.
INSERT INTO "cash_account_access" ("cash_account_id", "user_id")
SELECT ca."id", u."id"
FROM "cash_accounts" ca
CROSS JOIN "users" u
WHERE u."is_admin" = true
  OR u."permissions" @> '"cash"'
  OR u."permissions" @> '"income"'
  OR u."permissions" @> '"expense"'
ON CONFLICT DO NOTHING;