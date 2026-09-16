import { FEEL } from "@/lib/feel";
import type { PartTuple } from "@/lib/worlddoc";

/**
 * Where a fall stops being a fall and becomes a respawn.
 *
 * `FEEL.fallOutY` is a floor for the whole game, twenty units down, chosen
 * before there were courses. Every shipped course is built from y = 0 up, so
 * a runner who misses a pad drops twenty-eight units — the better part of two
 * seconds at terminal speed — through empty sky before the game admits what
 * both of them already know. The spec's own line for the obby loop is "fall
 * out → back in control in under 0.3 s", and the fall itself was the wait.
 *
 * So the plane is the world's lowest block minus a margin, and never lower
 * than the old floor. Six units under the lowest thing that exists is not a
 * place anyone is coming back from: the jump arc tops out under two.
 *
 * Computed once per parts map and cached against it. In Play the map is
 * never edited, so this runs once per world.
 */

/** Units below the lowest part before a fall is called. */
export const FALL_MARGIN = 6;

const cache = new WeakMap<Map<string, PartTuple>, number>();

export function fallPlaneFor(parts: Map<string, PartTuple>): number {
  const hit = cache.get(parts);
  if (hit !== undefined) return hit;
  let lowest = Infinity;
  for (const p of parts.values()) if (p[1] < lowest) lowest = p[1];
  const plane = lowest === Infinity ? FEEL.fallOutY : Math.max(FEEL.fallOutY, lowest - FALL_MARGIN);
  cache.set(parts, plane);
  return plane;
}
