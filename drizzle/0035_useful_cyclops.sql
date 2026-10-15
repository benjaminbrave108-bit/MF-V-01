ALTER TABLE "records" ADD COLUMN "import_batch" text;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "import_key" text;--> statement-breakpoint
CREATE INDEX "records_import_key_idx" ON "records" USING btree ("import_key");--> statement-breakpoint
CREATE INDEX "records_import_batch_idx" ON "records" USING btree ("import_batch");