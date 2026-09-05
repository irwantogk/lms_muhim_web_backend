ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nisn" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nisn_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nisn_hash_unique" UNIQUE("nisn_hash");