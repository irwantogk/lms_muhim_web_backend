ALTER TYPE "public"."material_type" ADD VALUE 'catatan';--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "file_url" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "content" text;