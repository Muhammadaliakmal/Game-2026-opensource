import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * A race's synchronised state.
 *
 * Same rule as the build room's presence: only
 * what genuinely changes goes through the encoder, and the world itself still
 * arrives as one snapshot on join.
 *
 * Lap, place and sector are one byte each. `progress` is the fraction of the
 * current lap and is the only float that has to be here — the HUD ranks riders
 * from it every frame, and recomputing it on four clients from positions they
 * each interpolate differently is how two people end up disagreeing about who
 * is winning.
 */
export const Rider = schema(
  {
    name: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    yaw: t.angle(),
    /** The lap they are on, 1-based once running. Never exceeds the race length. */
    lap: t.uint8().default(0),
    /** 0..1 round the current lap. */
    progress: t.float32().default(0),
    /** Finishing position, or 0 while still out on track. */
    place: t.uint8().default(0),
    /** Their finishing time in milliseconds, or 0. */
    timeMs: t.uint32().default(0),
  },
  "Rider"
);
export type Rider = SchemaType<typeof Rider>;

export const RaceState = schema(
  {
    riders: t.map(Rider),
    /** "waiting" | "countdown" | "racing" | "finished" — see race.ts. */
    phase: t.string().default("waiting"),
    /** Laps in this race, so the HUD never hardcodes it. */
    laps: t.uint8().default(3),
    /**
     * Milliseconds remaining on the countdown, republished as it ticks.
     *
     * A deadline timestamp would be the tidier thing to send once, but it would
     * be a *server* timestamp: every client would have to know the clock skew
     * between the two machines to render it, and a start light that is half a
     * second out is worse than one that ticks.
     */
    countdownMs: t.uint16().default(0),
    /**
     * How many riders this grid is waiting for before the lights arm.
     *
     * Published rather than left server-side because the waiting screen has to
     * say "2 of 4" — and because anyone in the room may change it, so every
     * client needs to see the change rather than only the one who made it.
     */
    target: t.uint8().default(2),
  },
  "RaceState"
);
export type RaceState = SchemaType<typeof RaceState>;
