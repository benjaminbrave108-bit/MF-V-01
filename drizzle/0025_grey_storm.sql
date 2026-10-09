ALTER TABLE "finance_notes" DROP CONSTRAINT "finance_notes_assigned_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "finance_notes" DROP COLUMN "assigned_user_id";