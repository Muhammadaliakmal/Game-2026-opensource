import type { Checkpoint } from "./worlddoc";

/**
 * Which checkpoint a runner has reached.
 *
 * Pure, and separate from the component that draws them, because this is the
 * rule that decides whether a fall costs you thirty seconds or two — which
 * makes it the one part of the parkour mode worth being able to test without
 * a browser.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 * Forward only. A checkpoint counts when you are inside its zone AND it is
 * later in the course than the one you already have. Without the second half,
 * running back through a gate you passed a minute ago would move your resume
 * point backwards, and the punishment for exploring would be losing progress
 * you had already earned.
 *
 * Order comes from the array, not from geometry. A course author decides what
 * "later" means; the runtime does not try to infer it from distance, which
 * would be wrong the moment a course doubles back on itself — and doubling
 * back is what the good ones do.
 */

/**
 * A cylinder, not a sphere.
 *
 * Checkpoints sit on flat pads, and a sphere would demand more precision at
 * the edge of a pad than at its middle for a difference no player can see.
 * Generous upward because you are frequently mid-jump when you cross one, and
 * tight downward so running underneath a checkpoint on the deck below is not
 * a save.
 */
export const CHECKPOINT_RADIUS = 2.2;
export const CHECKPOINT_ABOVE = 3;
export const CHECKPOINT_BELOW = 1.6;

/** Is this position inside the given checkpoint's zone? */
export function inCheckpoint(
  x: number,
  y: number,
  z: number,
  cp: Checkpoint
): boolean {
  const dx = x - cp.pos[0];
  const dz = z - cp.pos[2];
  if (dx * dx + dz * dz > CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) return false;
  const dy = y - cp.pos[1];
  return dy <= CHECKPOINT_ABOVE && dy >= -CHECKPOINT_BELOW;
}

/**
 * The checkpoint index a runner should now hold, given where they are.
 *
 * Returns `current` unchanged when nothing new was reached, so the caller can
 * compare identities and only act on a change. Scans from the end so that
 * clipping the corner of two overlapping zones banks the further one — the
 * generous reading, which is the right one for a mechanic whose whole job is
 * to make failure cheap.
 */
export function checkpointAt(
  x: number,
  y: number,
  z: number,
  checkpoints: readonly Checkpoint[],
  current: number
): number {
  for (let i = checkpoints.length - 1; i > current; i--) {
    if (inCheckpoint(x, y, z, checkpoints[i])) return i;
  }
  return current;
}

/**
 * Where a run resumes: the held checkpoint, or the world's spawn.
 *
 * The yaw matters as much as the position. Respawning at a checkpoint facing
 * whichever way the camera happened to be pointing when you died means the
 * first thing every attempt does is spin around, and on a course where the
 * next jump is two seconds away that is the difference between a retry and a
 * second death.
 */
export function resumePose(
  checkpoints: readonly Checkpoint[] | undefined,
  index: number,
  spawn: readonly [number, number, number],
  spawnYaw = 0
): { pos: [number, number, number]; yaw: number } {
  const cp = index >= 0 ? checkpoints?.[index] : undefined;
  if (!cp) return { pos: [spawn[0], spawn[1], spawn[2]], yaw: spawnYaw };
  return { pos: [cp.pos[0], cp.pos[1], cp.pos[2]], yaw: cp.yaw };
}
