CREATE INDEX "assignment_submissions_student_idx" ON "assignment_submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "assignments_subject_idx" ON "assignments" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "assignments_teacher_idx" ON "assignments" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "assignments_deadline_idx" ON "assignments" USING btree ("deadline");