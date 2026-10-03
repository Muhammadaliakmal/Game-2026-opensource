/**
 * The world document's types, palette and finishes — everything about a
 * WorldDoc except its zod schema.
 *
 * Split from worlddoc.ts so that code which only needs a constant can be
 * shipped to a browser without zod and every schema in this file. The route
 * solver reads `isHazard`, `medals.ts` reads the solver, and the daily
 * challenge on the home page reads `medals.ts`: that chain put zod in the
 * front page's client bundle. `worlddoc.ts` re-exports all of this, so an
 * import from there is unchanged; import from here only where the bundle
 * size matters.
 */
import { MAX_TEXTURE, TEXTURES } from "./texture-list";

export type Shape = 0 | 1 | 2 | 3; // 0=block, 1=slab, 2=ramp, 3=wedge
export type Vec3 = [number, number, number];
/**
 * tuple: [x, y, z, shape, colorIndex, finish, rot, texture?]
 * (rot 0..3 = 90° yaw steps; texture indexes TEXTURES, absent = 0 = plain)
 *
 * The eighth field is optional so that every seven-number part — every world
 * saved before surfaces existed, every shipped course, every op a peer on an
 * older build sends — stays valid without a migration. Read it with
 * `textureOf`, never `p[7]` directly.
 */
export type PartTuple = [number, number, number, Shape, number, number, number, number?];

/** The surface index of a part, treating a missing field as plain. */
export const textureOf = (p: PartTuple): number => p[7] ?? 0;

export { TEXTURES, MAX_TEXTURE };
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
/**
 * Finishes, index-addressed like the palette, and append-only for the same
 * reason: every saved part stores one of these as a number.
 *
 * `hazard` is the fifth. It is a finish rather than a surface or a flag
 * because a finish is already the one field that decides how a block is
 * *made* (a material bucket, an editor chip, a schema bound) — and a block
 * that kills is a different kind of block, not a different picture on the
 * same one. It glows like `emissive` and pulses, so it is legible from the
 * air, and `isHazard` is the one predicate the player, the route solver and
 * the course floor all read. Touch one and the run resumes at the last
 * checkpoint; see `Player.tsx`.
 */
export const FINISHES = ["matte", "glossy", "metal", "emissive", "hazard"] as const;
export const HAZARD_FINISH = 4;
export const isHazard = (p: PartTuple): boolean => p[5] === HAZARD_FINISH;

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
