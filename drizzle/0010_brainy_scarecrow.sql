CREATE TABLE "forum_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forum_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_topic_id_forum_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."forum_topics"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "forum_topics" ADD CONSTRAINT "forum_topics_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "forum_replies_topic_idx" ON "forum_replies" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "forum_replies_author_idx" ON "forum_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "forum_topics_class_idx" ON "forum_topics" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "forum_topics_subject_idx" ON "forum_topics" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "forum_topics_author_idx" ON "forum_topics" USING btree ("author_id");