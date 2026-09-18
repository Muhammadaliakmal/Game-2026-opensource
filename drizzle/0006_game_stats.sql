CREATE TABLE "game_likes" (
	"slug" text NOT NULL,
	"anon_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_likes_slug_anon_id_pk" PRIMARY KEY("slug","anon_id")
);
--> statement-breakpoint
CREATE TABLE "game_plays_daily" (
	"slug" text NOT NULL,
	"day" text NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "game_plays_daily_slug_day_pk" PRIMARY KEY("slug","day")
);
--> statement-breakpoint
CREATE TABLE "game_stats" (
	"slug" text PRIMARY KEY NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_hits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_plays_daily_day_idx" ON "game_plays_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "rate_hits_expires_idx" ON "rate_hits" USING btree ("expires_at");