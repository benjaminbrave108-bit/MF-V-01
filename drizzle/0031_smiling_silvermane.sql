CREATE TABLE "list_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "amount" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "list_allocations" ADD CONSTRAINT "list_allocations_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_allocations" ADD CONSTRAINT "list_allocations_recipient_id_workspace_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."workspace_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_allocations_list_recipient_idx" ON "list_allocations" USING btree ("list_id","recipient_id");--> statement-breakpoint
-- Geri doldurma: mevcut ürün satırlarından liste tutarı ve alıcı dağılımı.
UPDATE "lists" l SET "amount" = COALESCE((SELECT sum(i.amount) FROM "list_items" i WHERE i.list_id = l.id), 0);
--> statement-breakpoint
INSERT INTO "list_allocations" ("list_id", "recipient_id", "amount")
SELECT i.list_id, i.recipient_id, sum(i.amount) FROM "list_items" i WHERE i.recipient_id IS NOT NULL GROUP BY i.list_id, i.recipient_id;
