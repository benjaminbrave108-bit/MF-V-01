CREATE TABLE "comment_thread_archives" (
	"record_id" integer PRIMARY KEY NOT NULL,
	"archived_by_user_id" integer,
	"archived_by_name" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_reads" (
	"user_id" integer NOT NULL,
	"note_id" integer NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_reads_user_id_note_id_pk" PRIMARY KEY("user_id","note_id")
);
--> statement-breakpoint
ALTER TABLE "finance_notes" ADD COLUMN "assigned_user_id" integer;--> statement-breakpoint
ALTER TABLE "finance_notes" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_notes" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment_thread_archives" ADD CONSTRAINT "comment_thread_archives_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread_archives" ADD CONSTRAINT "comment_thread_archives_archived_by_user_id_users_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_reads" ADD CONSTRAINT "note_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_reads" ADD CONSTRAINT "note_reads_note_id_finance_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."finance_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_reads_user_id_idx" ON "note_reads" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "finance_notes" ADD CONSTRAINT "finance_notes_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;