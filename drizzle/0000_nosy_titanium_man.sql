CREATE TABLE "worlds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"doc" jsonb NOT NULL,
	"thumbnail_url" text,
	"published" integer DEFAULT 0 NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "owner_idx" ON "worlds" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "pub_idx" ON "worlds" USING btree ("published");