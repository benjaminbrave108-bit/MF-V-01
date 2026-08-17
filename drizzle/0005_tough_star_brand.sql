CREATE INDEX "archive_at_idx" ON "archive" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "finance_notes" ADD CONSTRAINT "finance_notes_status_check" CHECK ("finance_notes"."status" IN ('important', 'urgent', 'pending', 'completed'));--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_kind_check" CHECK ("records"."kind" IN ('cash', 'income', 'expense'));