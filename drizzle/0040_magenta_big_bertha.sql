CREATE TABLE "note_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text DEFAULT '#398db1' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "note_columns_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "note_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"user_id" integer,
	"user_name" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_notes" DROP CONSTRAINT "finance_notes_status_check";--> statement-breakpoint
ALTER TABLE "finance_notes" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_note_id_finance_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."finance_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_comments_note_id_idx" ON "note_comments" USING btree ("note_id");
--> statement-breakpoint
INSERT INTO "note_columns" ("key","label","color","sort_order") VALUES ('important','Önemli Notlar','#d6a52b',0),('urgent','Acil Notlar','#df5b5b',1),('pending','Bekleyen Notlar','#398db1',2),('completed','Tamamlanmış Notlar','#38a477',3) ON CONFLICT ("key") DO NOTHING;