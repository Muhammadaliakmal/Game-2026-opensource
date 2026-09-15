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
    /**
     * The player's best time posted during `week_key`, and which ISO week
     * that is (`lib/daily.ts`).
     *
     * The weekly board is the answer to "a global all-time board demotivates
     * everyone who was not here first". It cannot be a filter on `updated_at`
     * — a run only updates that row when it beats the all-time best, so a
     * regular who ran the course every day this week would be absent from
     * this week's board. These two hold the week's own best, reset by the
     * write path the moment the key changes. Null until the player posts a
     * run after the columns existed: the board is honest about that rather
     * than backfilled from a best that may have been set a year ago.
     */
    weekMs: integer("week_ms"),
    weekKey: text("week_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.worldId, t.userId] }),
    // The board query, and the only one that runs on a page load: every row
    // for a world, in time order. Without it a popular map table-scans.
    boardIdx: index("runs_board_idx").on(t.worldId, t.timeMs),
    // The weekly board: the same scan, keyed by the week. Partial, because a
    // row that has never posted since the column existed is not on any week.
    weekIdx: index("runs_week_idx")
      .on(t.worldId, t.weekKey, t.weekMs)
      .where(sql`${t.weekMs} is not null`),
  })
);

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

/**
 * One row per player: their wallet, what they have bought, and who they are
 * wearing.
 *
 * ── Why a row and not localStorage ───────────────────────────────────────
 *
 * The equipped character alone could live in the browser — it is cosmetic, and
 * losing it would cost nobody anything. The coin balance cannot: a balance is
 * a thing worth forging, and a number a client keeps is a number a client
 * writes. So both live here, on the same row, because a purchase has to read
 * one and write the other in a single statement or it is a race.
 *
 * ── Why `user_id` is the primary key and there is no serial id ───────────
 *
 * There is exactly one of these per account and it is only ever looked up by
 * the account. A surrogate key would add a column, an index and a join to
 * every read for nothing.
 *
 * The row is created lazily — most accounts never open the shop — so every
 * reader has to treat "no row" as the starting state rather than as an error:
 * zero coins, nothing owned, wearing the default. See `lib/db/players.ts`.
 */
export const players = pgTable("players", {
  userId: text("user_id").primaryKey(), // Clerk user id
  /**
   * Earned by finishing courses, never granted by the client. See the award
   * rule in `POST /api/worlds/:id/runs` — a course pays out at most once per
   * medal tier, so a board cannot be farmed by shaving a millisecond.
   */
  coins: integer("coins").default(0).notNull(),
  /**
   * Characters bought. Not a join table: this is a handful of ids per player
   * drawn from a fixed catalog, and a purchase is one conditional UPDATE
   * against this array rather than an INSERT that has to be checked first.
   */
  owned: text("owned").array().default([]).notNull(),
  /** The character being worn. Always a catalog id — see lib/characters.ts. */
  character: text("character").default("courier").notNull(),
  /**
   * Coins the arcade has paid this player on `arcade_day`.
   *
   * The arcade cannot use the course payout rule — an endless runner has no
   * "best possible" for a difference to be measured against — so it pays per
   * run, and a score is a number a client computes. This column is what makes
   * that safe: it is the server's own record of the day, and the daily
   * ceiling in `lib/arcade-payout.ts` is clamped against it rather than
   * against anything the client says. See `awardArcadeCoins`.
   */
  arcadeCoins: integer("arcade_coins").default(0).notNull(),
  /**
   * The day `arcade_coins` belongs to, as YYYY-MM-DD.
   *
   * Text rather than a date, and the player's local day rather than UTC: a
   * daily cap should roll over at the player's midnight, which is a fact only
   * their browser knows. Storing what they claim is fine — the worst a lie
   * about the date buys is one extra day's ceiling, and the ceiling is the
   * thing being defended.
   */
  arcadeDay: text("arcade_day").default("").notNull(),
  /**
   * The last UTC day this player collected the daily challenge bonus, as
   * YYYY-MM-DD from `lib/daily.ts`.
   *
   * UTC rather than the player's day, unlike `arcade_day`: the challenge is
   * shared, so its day has to be the same day for everyone. Set in the same
   * UPDATE that pays the bonus, with the old value in the WHERE clause, so
   * two tabs finishing today's course together cannot both collect it.
   */
  dailyDay: text("daily_day").default("").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
