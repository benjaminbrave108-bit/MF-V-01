CREATE TABLE "cash_expense_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text DEFAULT '' NOT NULL,
	"cash_account_id" integer,
	"cash_account_name" text DEFAULT '' NOT NULL,
	"start_date" text DEFAULT '' NOT NULL,
	"end_date" text DEFAULT '' NOT NULL,
	"budget" numeric(14, 2) DEFAULT 0 NOT NULL,
	"report_ready" boolean DEFAULT false NOT NULL,
	"report_delivered" boolean DEFAULT false NOT NULL,
	"report_date" text DEFAULT '' NOT NULL,
	"responsible" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"result_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_expense_sheets" ADD CONSTRAINT "cash_expense_sheets_cash_account_id_cash_accounts_id_fk" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_expense_sheets_cash_account_id_idx" ON "cash_expense_sheets" USING btree ("cash_account_id");--> statement-breakpoint
CREATE INDEX "cash_expense_sheets_cash_account_name_idx" ON "cash_expense_sheets" USING btree ("cash_account_name");