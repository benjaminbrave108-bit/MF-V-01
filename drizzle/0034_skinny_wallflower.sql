CREATE TABLE "expense_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"recipient_id" integer NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_recipient_id_workspace_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."workspace_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_allocations_record_recipient_idx" ON "expense_allocations" USING btree ("record_id","recipient_id");--> statement-breakpoint
-- Geri doldurma: listelerin alıcı dağılımı, listenin gider kaydına (Gider sayfasındaki satır) taşınır.
INSERT INTO "expense_allocations" ("record_id", "recipient_id", "amount")
SELECT l.expense_record_id, a.recipient_id, a.amount
FROM "list_allocations" a JOIN "lists" l ON l.id = a.list_id
WHERE l.expense_record_id IS NOT NULL AND a.amount > 0
ON CONFLICT DO NOTHING;
