import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { WorldDoc } from "@/lib/worlddoc";
import type { GhostTrack } from "@/lib/ghost";

export const worlds = pgTable("worlds", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull(), // Clerk user id
  name: text("name").notNull(),
  doc: jsonb("doc").$type<WorldDoc>().notNull(), // typed JSONB column
  thumbnailUrl: text("thumbnail_url"),
  published: integer("published").default(0).notNull(),
  playCount: integer("play_count").default(0).notNull(),
  /**
   * The solver's route through this world, in ms, or null if it is not a course.
   *
   * Server-derived and never read off the incoming document — see
   * `lib/course-floor.ts` for why a floor the client writes is not a floor.
   * Every path that writes `doc` has to write this beside it, or a course
   * keeps the medals of the geometry it used to have.
   *
   * It is also the definition of "course" the app queries by: a world with a
   * floor has a reachable goal, which is exactly what makes it finishable.
   */
  floorMs: integer("floor_ms"),
  /**
   * The fingerprint of the geometry `floor_ms` was solved from.
   *
   * A match means the two-second Dijkstra can be skipped, which is what makes
   * a five-second multiplayer autosave affordable. See `courseKey`.
   */
  floorKey: text("floor_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  ownerIdx: index("owner_idx").on(t.ownerId),
  pubIdx: index("pub_idx").on(t.published),
  // Published worlds that can be finished, newest first — the community
  // course list. Partial, because most worlds are not courses and there is no
  // reason for the ones that aren't to be in it.
  courseIdx: index("worlds_course_idx")
    .on(t.published, t.updatedAt)
    .where(sql`${t.floorMs} is not null`),
}));

export type World = typeof worlds.$inferSelect;
export type NewWorld = typeof worlds.$inferInsert;

/**
 * One row per player per course, holding their best run.
 *
 * ── Best-per-player, not one row per attempt ─────────────────────────────
 *
 * A leaderboard wants the best time each person has posted, and a player
 * grinding a map five hundred times should not write five hundred rows for a
 * board that will only ever show one of them. The cost is run history, which
 * nothing in the app asks for; the saving is that the board is a plain
 * `ORDER BY time_ms LIMIT n` over a table that grows with players rather than
 * with attempts, and that a ghost is stored once per player rather than once
 * per run.
 *
 * ── Why `world_id` is text and there is no foreign key ───────────────────
 *
 * `worlds.id` is a uuid, but the courses that ship are generated from code and
 * addressed by slug — "parkour", "overclock" — with no row to point at. Those
 * are the maps a leaderboard is actually for, so the column has to hold both,
 * which means text. A foreign key would make the shipped courses the one thing
 * that could not be raced.
 */
export const runs = pgTable(
  "runs",
  {
    worldId: text("world_id").notNull(),
    userId: text("user_id").notNull(), // Clerk user id
    /**
     * The player's display name, copied at submission time.
     *
     * Denormalised deliberately: Clerk is the authority on names and it is an
     * HTTP call away, so joining to it would mean one request per row every
     * time anybody opened a board. A renamed player's old entry shows their
     * old name until they post another time, which is a fair trade for a
     * board that is one query.
     */
    name: text("name").notNull(),
    timeMs: integer("time_ms").notNull(),
    /** The medal this time earned, or null. Stored so the board need not recompute. */
    medal: text("medal"),
    /** The replay, if the client recorded one. See lib/ghost.ts. */
    ghost: jsonb("ghost").$type<GhostTrack>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldId, t.userId] }),
    // The board query, and the only one that runs on a page load: every row
    // for a world, in time order. Without it a popular map table-scans.
    boardIdx: index("runs_board_idx").on(t.worldId, t.timeMs),
  })
);

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
