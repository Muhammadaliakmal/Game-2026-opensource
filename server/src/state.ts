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
