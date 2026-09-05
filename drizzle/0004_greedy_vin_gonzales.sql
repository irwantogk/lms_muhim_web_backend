CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_url" text NOT NULL,
	"type" "material_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "materials_class_idx" ON "materials" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "materials_subject_idx" ON "materials" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "materials_teacher_idx" ON "materials" USING btree ("teacher_id");