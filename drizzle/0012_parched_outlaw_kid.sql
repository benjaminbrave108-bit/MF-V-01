CREATE TABLE "record_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_comments" ADD CONSTRAINT "record_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_comments_record_id_idx" ON "record_comments" USING btree ("record_id");