CREATE TABLE "cash_expense_sheet_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sheet_row_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_expense_sheet_comments" ADD CONSTRAINT "cash_expense_sheet_comments_sheet_row_id_cash_expense_sheets_id_fk" FOREIGN KEY ("sheet_row_id") REFERENCES "public"."cash_expense_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_expense_sheet_comments" ADD CONSTRAINT "cash_expense_sheet_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_expense_sheet_comments_sheet_row_id_idx" ON "cash_expense_sheet_comments" USING btree ("sheet_row_id");