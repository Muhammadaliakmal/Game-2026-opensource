CREATE TABLE "players" (
	"user_id" text PRIMARY KEY NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"owned" text[] DEFAULT '{}' NOT NULL,
	"character" text DEFAULT 'courier' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
