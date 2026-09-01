import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import type { WorldDoc } from "@/lib/worlddoc";

export const worlds = pgTable("worlds", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(), // Clerk user id
  name: text("name").notNull(),
  doc: jsonb("doc").$type<WorldDoc>().notNull(), // typed JSONB column
  thumbnailUrl: text("thumbnail_url"),
  published: integer("published").default(0).notNull(),
  playCount: integer("play_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  ownerIdx: index("owner_idx").on(t.ownerId),
  pubIdx: index("pub_idx").on(t.published),
}));

export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;
