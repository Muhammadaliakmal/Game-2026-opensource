ALTER TABLE "worlds" ADD COLUMN "floor_ms" integer;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "floor_key" text;--> statement-breakpoint
CREATE INDEX "worlds_course_idx" ON "worlds" USING btree ("published","updated_at") WHERE "worlds"."floor_ms" is not null;