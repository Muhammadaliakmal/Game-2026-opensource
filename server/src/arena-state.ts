import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A duel's synchronised state.
 *
 * Same rule as the build room's presence (state.ts): only what genuinely
 * changes goes through the encoder. Health and score are one byte each, and
 * the phase is what the HUD keys off — the world itself still arrives as one
 * snapshot on join.
 */
export const Fighter = schema(
  {
    name: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.angle(),
    hp: t.uint8().default(100),
    score: t.uint8().default(0),
    downed: t.boolean().default(false),
  },
  "Fighter"
);
export type Fighter = SchemaType<typeof Fighter>;

export const ArenaState = schema(
  {
    fighters: t.map(Fighter),
    /** "waiting" | "fighting" | "over" — see arena-match.ts. */
    phase: t.string().default("waiting"),
    /** Session id of the winner, or "" while the fight is still on. */
    winner: t.string().default(""),
  },
  "ArenaState"
);
export type ArenaState = SchemaType<typeof ArenaState>;
