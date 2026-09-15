ALTER TABLE "players" ADD COLUMN "daily_day" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "week_ms" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "week_key" text;--> statement-breakpoint
CREATE INDEX "runs_week_idx" ON "runs" USING btree ("world_id","week_key","week_ms") WHERE "runs"."week_ms" is not null;