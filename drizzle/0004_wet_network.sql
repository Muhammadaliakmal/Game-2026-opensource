ALTER TABLE "players" ADD COLUMN "arcade_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "arcade_day" text DEFAULT '' NOT NULL;