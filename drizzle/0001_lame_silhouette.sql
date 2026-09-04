CREATE TABLE "runs" (
	"world_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"time_ms" integer NOT NULL,
	"medal" text,
	"ghost" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "runs_world_id_user_id_pk" PRIMARY KEY("world_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "runs_board_idx" ON "runs" USING btree ("world_id","time_ms");