import { keyOf } from "@/lib/cell-key";
import { isHazard, type PartTuple } from "@/lib/worlddoc";

/**
 * Is the character touching a hazard block.
 *
 * ── Two tests, because a floor and a wall are touched differently ────────
 *
 * The capsule is radius 0.3, half-height 0.3, and floats 0.2 above whatever
 * it stands on: from its centre the sole is 0.6 down, the ground 0.8, the
 * crown 0.6 up, the sides 0.3 out.
 *
 *  - **Underfoot** is the one cell straight below the centre, through the
 *    float gap. Standing on lava kills; standing on a safe tile with lava
 *    tiles either side of it does not, even at the tile's edge. The tile
 *    floor in the Gauntlet is one cell wide, and a rule that sampled the
 *    neighbours at ground level would make the safe band 0.4 of a cell —
 *    a test of pixel placement, not of nerve.
 *  - **The body** is every cell from the shins to the crown, sampled at the
 *    radius in all four directions. A lava pillar beside the path kills on
 *    a graze, which is what makes it a wall. It starts a hair above the
 *    ground cell so the tiles beside a safe tile are never in it.
 *
 * Nine `Map.get`s a frame at most, no allocation, and the same parts map the
 * footsteps already read. Erring toward death on the walls and toward life
 * on the floor is the split that makes the traps feel honest.
 */

/** Centre to the ground cell, through the float gap, plus a hair. */
const GROUND = 0.85;
/** The body: from just above the ground cell to the crown. */
const SHIN = 0.55;
const CROWN = 0.6;
/** The capsule's radius, sampled at its extremes. */
const R = 0.3;

const DX = [R, -R, 0, 0];
const DZ = [0, 0, R, -R];

export function touchingHazard(
  parts: ReadonlyMap<string, PartTuple>,
  x: number,
  y: number,
  z: number
): boolean {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const under = parts.get(keyOf(cx, Math.floor(y - GROUND), cz));
  if (under && isHazard(under)) return true;

  const low = Math.floor(y - SHIN);
  const high = Math.floor(y + CROWN);
  for (let i = 0; i < 4; i++) {
    const sx = Math.floor(x + DX[i]);
    const sz = Math.floor(z + DZ[i]);
    for (let cy = low; cy <= high; cy++) {
      const p = parts.get(keyOf(sx, cy, sz));
      if (p && isHazard(p)) return true;
    }
  }
  return false;
}
