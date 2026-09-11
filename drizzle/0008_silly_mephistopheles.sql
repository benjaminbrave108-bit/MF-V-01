CREATE TABLE "cash_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_cash_account_id" integer NOT NULL,
	"to_cash_account_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"date" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"recipient_person" text DEFAULT '' NOT NULL,
	"recipient_user_id" integer,
	"created_by_user_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_by_user_id" integer,
	"confirmed_at" timestamp with time zone,
	"from_record_id" integer,
	"to_record_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_transfers_status_check" CHECK ("cash_transfers"."status" IN ('pending', 'confirmed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("from_cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("to_cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_record_id_records_id_fk" FOREIGN KEY ("from_record_id") REFERENCES "public"."records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_record_id_records_id_fk" FOREIGN KEY ("to_record_id") REFERENCES "public"."records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_transfers_from_idx" ON "cash_transfers" USING btree ("from_cash_account_id");--> statement-breakpoint
CREATE INDEX "cash_transfers_to_idx" ON "cash_transfers" USING btree ("to_cash_account_id");--> statement-breakpoint
CREATE INDEX "cash_transfers_status_idx" ON "cash_transfers" USING btree ("status");