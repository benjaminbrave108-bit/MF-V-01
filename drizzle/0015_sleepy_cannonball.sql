CREATE TABLE "comment_reads" (
	"user_id" integer NOT NULL,
	"record_id" integer NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reads_user_id_record_id_pk" PRIMARY KEY("user_id","record_id")
);
--> statement-breakpoint
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_reads_user_id_idx" ON "comment_reads" USING btree ("user_id");