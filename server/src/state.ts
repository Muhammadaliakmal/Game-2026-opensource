import { MapSchema, schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Presence — and ONLY presence. The world itself is deliberately not in here:
 * a 50k-part voxel map has no business going through the schema encoder's
 * per-field diffing. Parts travel as one snapshot on join and as ops after
 * that (see world-session.ts); this state is the handful of numbers that
 * genuinely change every frame.
 *
 * There is no chat field and there never will be one. SPEC §10 declines
 * comments in v1 over the moderation and child-safety burden, and a text
 * channel between strangers is the same burden with a different name.
 */
export const Player = schema(
  {
    /** Display name from the account. Never user-typed free text. */
    name: t.string().default(""),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    /**
     * Facing, as a wrapping 16-bit angle — half the bytes of a float32 at
     * ~0.0055° per step, which is far finer than anyone can see on an avatar.
     */
    yaw: t.angle(),
    /** True while this peer is in Build mode, false while playing. */
    building: t.boolean().default(true),
    /**
     * Which character this peer is wearing — a `lib/characters.ts` id.
     *
     * Session state and not part of the move message: it is chosen in the shop
     * and then does not change for the life of a connection, so sending it at
     * 12 Hz alongside the position would be paying for it sixty times a minute
     * to say the same thing.
     *
     * The room checks it is a real catalog id, and deliberately does NOT check
     * that the player bought it. Ownership lives in the app's database, which
     * this process has no credentials for, and the cost of being wrong is that
     * somebody who edited their own client appears to strangers as a character
     * they did not pay for. That is a cosmetic lie on somebody else's screen,
     * not a score — and the check that would prevent it is a per-join HTTP
     * round trip to the app for every player in every room.
     */
    character: t.string().default("courier"),
  },
  "Player"
);
export type Player = SchemaType<typeof Player>;

export const RoomPresence = schema(
  {
    players: t.map(Player),
    /**
     * Bumped by every accepted edit. A client that reconnects can compare it
     * with the revision of the snapshot it holds and ask for a fresh one
     * rather than replaying from a world it can no longer trust.
     */
    revision: t.uint32().default(0),
  },
  "RoomPresence"
);
export type RoomPresence = SchemaType<typeof RoomPresence>;

export { MapSchema };
