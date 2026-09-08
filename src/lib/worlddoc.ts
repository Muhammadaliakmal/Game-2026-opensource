import { z } from "zod";

export type Shape = 0 | 1 | 2 | 3; // 0=block, 1=slab, 2=ramp, 3=wedge
export type Vec3 = [number, number, number];
// tuple: [x, y, z, shape, colorIndex, finish, rot]  (rot 0..3 = 90° yaw steps)
export type PartTuple = [number, number, number, Shape, number, number, number];
export interface PropInstance {
  assetId: string;
  pos: Vec3;
  rot: Vec3;
  scale: Vec3;
}

/**
 * A place a run resumes from.
 *
 * ── Why a marker list and not a part kind ────────────────────────────────
 *
 * A checkpoint could have been a fifth `Shape`, and that was the first idea.
 * Three things ruled it out:
 *
 *  - A part is a fixed seven-number tuple with no spare field, and a
 *    checkpoint needs two things a block does not have: an ORDER, so it cannot
 *    be reached out of sequence, and a FACING, so you resume looking the way
 *    you were going rather than back down the course you just climbed.
 *  - Every renderer, collider builder and greedy mesher switches on shape.
 *    A shape that is not solid, not drawn like a block and not collidable
 *    would need a special case in each of them.
 *  - There are thousands of parts in a world and a handful of checkpoints. A
 *    sparse list is the honest shape for sparse data, and it can be read
 *    without walking the parts array.
 *
 * `yaw` is a camera heading in radians, in the same convention the player's
 * look rig uses. Note the sign: the rig puts the eye at `+(sin yaw, cos yaw)`
 * from the character and looks back down it, so the direction the player sees
 * along is `-(sin yaw, cos yaw)`. Use `FACING` in lib/course-kit.ts rather than
 * writing one of these by hand.
 */
export interface Checkpoint {
  pos: Vec3;
  yaw: number;
}

/**
 * The most resume points one course may have.
 *
 * Named rather than written twice, because the schema below is not the only
 * thing that has to agree with it: the editor refuses to place the sixty-fifth
 * checkpoint, and `lib/ops.ts` bounds a checkpoint op's index by it so a
 * crafted message cannot insert past the end. A cap enforced only at save time
 * is a cap the author meets as a validation error after the work is done.
 */
export const MAX_CHECKPOINTS = 64;
export interface WorldDoc {
  v: 1;
  id: string;
  name: string;
  ownerId: string;
  spawn: Vec3;
  /**
   * Which way a runner faces when they arrive at the spawn.
   *
   * Optional, and in the same convention as `Checkpoint.yaw`. Without it the
   * camera keeps whatever yaw the look rig happened to be holding — a fixed
   * quarter turn on a fresh page — so every course opened by walking into it
   * from the menu began by facing the wrong way and spinning round. A course
   * that goes somewhere has a direction; a sandbox does not, and leaving this
   * undefined is how a sandbox says so.
   */
  spawnYaw?: number;
  /**
   * Where the course is won, if it is a course at all.
   *
   * Optional because most worlds are not: the island and the cottage have
   * nothing to complete, and giving them a goal would invent a failure state
   * for worlds whose whole point is not having one. A world with no goal never
   * shows a timer and never finishes.
   */
  goal?: Vec3;
  /**
   * Ordered checkpoints, if this course has any.
   *
   * Optional for the same reason `goal` is: most worlds are not courses, and
   * a world with no checkpoints simply respawns at its spawn point, which is
   * what every world did before this existed.
   */
  checkpoints?: Checkpoint[];
  sky: number;
  parts: PartTuple[];
  props: PropInstance[];
}

// 32 hex swatches, index-addressed 0..31.
export const PALETTE: string[] = [
  "#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#1e293b", "#0f172a",
  "#fef08a", "#facc15", "#f59e0b", "#f97316", "#ea580c", "#dc2626",
  "#fca5a5", "#f472b6", "#ec4899", "#d946ef", "#a855f7", "#7c3aed",
  "#6366f1", "#3b82f6", "#0ea5e9", "#06b6d4", "#14b8a6", "#10b981",
  "#22c55e", "#84cc16", "#a3e635", "#78350f", "#57534e", "#a8a29e",
  "#000000", "#ffffff",
];
export const FINISHES = ["matte", "glossy", "metal", "emissive"] as const;

export const vec3 = z.tuple([z.number(), z.number(), z.number()]);
export const partTuple = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int().min(0).max(3), // shape
  z.number().int().min(0).max(31), // color index
  z.number().int().min(0).max(3), // finish
  z.number().int().min(0).max(3), // rot
]);
export const propInstance = z.object({
  assetId: z.string(),
  pos: vec3,
  rot: vec3,
  scale: vec3,
});
export const checkpoint = z.object({ pos: vec3, yaw: z.number() });
export const worldDocSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  name: z.string().min(1).max(80),
  ownerId: z.string(),
  spawn: vec3,
  spawnYaw: z.number().finite().optional(),
  goal: vec3.optional(),
  // Capped low on purpose: a course with more than this many resume points is
  // not a course, and the cap is what stops a crafted doc filling the play
  // scene with detection zones.
  checkpoints: z.array(checkpoint).max(MAX_CHECKPOINTS).optional(),
  sky: z.number().int().min(0),
  parts: z.array(partTuple).max(50000),
  props: z.array(propInstance).max(2000),
});
export const parseWorldDoc = (u: unknown): WorldDoc =>
  worldDocSchema.parse(u) as WorldDoc;

/** A fresh, empty world for a new owner — starting point for `POST /api/worlds`. */
export function emptyWorldDoc(id: string, ownerId: string, name = "Untitled World"): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: [0, 1, 0],
    sky: 0,
    parts: [],
    props: [],
  };
}
