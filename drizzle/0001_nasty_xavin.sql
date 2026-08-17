CREATE INDEX "records_kind_idx" ON "records" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "records_date_idx" ON "records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "records_cash_account_idx" ON "records" USING btree ("cash_account");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");