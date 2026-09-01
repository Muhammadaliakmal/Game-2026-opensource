import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * "Sky Yard" — the wandering world.
 *
 * A counterweight to the obstacle course: no goal, no failure state, nothing
 * to clear. An island in the void with trees, a standing arch and a lantern
 * path, plus three islets close enough to hop to. Townscaper's design lesson
 * (SPEC §9 #2) is that removing the score is what lets the act of looking
 * around be the point.
 *
 * Deliberately small — roughly a fifth of the part count of the landscape it
 * replaces. Every cell here is honest ground you can stand on: there is no
 * decorative water volume, because a solid block that looks like water is a
 * surface you walk on top of, which reads as a bug rather than a pond.
 *
 * Generation is fully deterministic. Built-ins are regenerated from code on
 * every request rather than stored, so anything random would mean the world
 * quietly rearranged itself between the editor and play mode.
 */

const BLOCK: Shape = 0;
const SLAB: Shape = 1;

// Palette indices (see PALETTE in worlddoc.ts).
const GRASS = 24;
const GRASS_DEEP = 23;
const MOSS = 26;
const DIRT = 27;
const STONE = 28;
const PALE = 29;
const BLOSSOM = 13;
const POLLEN = 6;
const LAVENDER = 16;
const WHITE = 31;

const MATTE = 0;
const GLOW = 3;

/** Island top surface. Everything hangs below it, and nothing goes under y=0 —
 *  parts below the grid floor cannot be edited once the world is remixed. */
const TOP = 6;
const RX = 12;
const RZ = 9;

/** 32-bit integer hash, so the scatter is stable without being obviously regular. */
function hash2(x: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function islandParts(): PartTuple[] {
  const cells = new Map<string, PartTuple>();
  const put = (
    x: number,
    y: number,
    z: number,
    shape: Shape,
    color: number,
    finish: number,
    rot = 0
  ) => {
    if (y < 0) return;
    cells.set(`${x},${y},${z}`, [x, y, z, shape, color, finish, rot]);
  };

  /** Elliptical falloff: 0 at the centre, 1 at the rim, >1 outside. */
  const fall = (x: number, z: number) => (x / RX) ** 2 + (z / RZ) ** 2;

  // ── The island ──────────────────────────────────────────────────────────
  // A grass cap over a body of dirt and stone that tapers to a point, so the
  // underside reads as a torn-off chunk of ground rather than a flat slab.
  for (let x = -RX; x <= RX; x++) {
    for (let z = -RZ; z <= RZ; z++) {
      const e = fall(x, z);
      if (e > 1) continue;

      const rim = e > 0.72;
      const surface = rim
        ? hash2(x, z, 17) > 0.7
          ? MOSS
          : GRASS_DEEP
        : hash2(x, z, 17) > 0.86
          ? GRASS_DEEP
          : GRASS;
      put(x, TOP, z, BLOCK, surface, MATTE);

      // Thickest under the middle, one block at the rim.
      const depth = 1 + Math.round((1 - e) * 4);
      for (let d = 1; d <= depth; d++) {
        put(x, TOP - d, z, BLOCK, d <= 1 ? DIRT : STONE, MATTE);
      }
    }
  }

  // ── Trees ───────────────────────────────────────────────────────────────
  const tree = (x: number, z: number, height: number, leaf: number) => {
    for (let i = 1; i <= height; i++) put(x, TOP + i, z, BLOCK, DIRT, MATTE);

    const crown = TOP + height;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          if (Math.hypot(dx, dz, dy * 1.3) > 2.35) continue;
          // Nibble the silhouette so the canopy is not an obvious sphere.
          if (hash2(x + dx * 31, z + dz * 17 + dy * 7, 55) > 0.78) continue;
          put(x + dx, crown + dy, z + dz, BLOCK, leaf, MATTE);
        }
      }
    }
  };

  tree(-7, -3, 4, GRASS_DEEP);
  tree(6, 4, 3, BLOSSOM);
  tree(-5, 5, 3, MOSS);
  tree(8, -4, 4, GRASS_DEEP);

  // ── Standing arch ───────────────────────────────────────────────────────
  // Something to walk under and orient by: a horizon landmark on a world with
  // no goal is what stops wandering turning into being lost.
  for (let y = 1; y <= 4; y++) {
    put(-1, TOP + y, -7, BLOCK, PALE, MATTE);
    put(3, TOP + y, -7, BLOCK, PALE, MATTE);
  }
  for (let x = -1; x <= 3; x++) put(x, TOP + 5, -7, BLOCK, PALE, MATTE);
  put(1, TOP + 6, -7, BLOCK, POLLEN, GLOW);

  // ── Lantern path ────────────────────────────────────────────────────────
  // Pale slabs wandering from the arch across the island, lit every few steps.
  let px = 1;
  let pz = -6;
  for (let step = 0; step < 16; step++) {
    if (fall(px, pz) <= 1) {
      put(px, TOP + 1, pz, SLAB, PALE, MATTE);
      if (step % 5 === 2) {
        put(px + 1, TOP + 1, pz, BLOCK, DIRT, MATTE);
        put(px + 1, TOP + 2, pz, BLOCK, POLLEN, GLOW);
      }
    }
    pz += 1;
    px += hash2(px, step, 44) > 0.62 ? 1 : hash2(px, step, 45) > 0.62 ? -1 : 0;
  }

  // ── Wildflowers ─────────────────────────────────────────────────────────
  // Slabs, so they are ankle-height decoration you walk over, not obstacles.
  for (let x = -RX; x <= RX; x++) {
    for (let z = -RZ; z <= RZ; z++) {
      if (fall(x, z) > 0.94) continue;
      if (cells.has(`${x},${TOP + 1},${z}`)) continue;
      const r = hash2(x, z, 313);
      if (r < 0.94) continue;
      const petal =
        r > 0.99 ? LAVENDER : r > 0.978 ? BLOSSOM : r > 0.965 ? POLLEN : WHITE;
      put(x, TOP + 1, z, SLAB, petal, MATTE);
    }
  }

  // ── Islets ──────────────────────────────────────────────────────────────
  // Two cells of gap and no rise, so they clear the jump arc comfortably.
  const islet = (cx: number, cz: number, r: number, y: number) => {
    for (let x = cx - r; x <= cx + r; x++) {
      for (let z = cz - r; z <= cz + r; z++) {
        if (Math.hypot(x - cx, z - cz) > r + 0.2) continue;
        put(x, y, z, BLOCK, GRASS, MATTE);
        put(x, y - 1, z, BLOCK, DIRT, MATTE);
        if (Math.hypot(x - cx, z - cz) < r - 0.8) put(x, y - 2, z, BLOCK, STONE, MATTE);
      }
    }
  };

  // Placed off the rim the ellipse actually has at that z, not off RX: at
  // z=3 the island only reaches x=11, so an islet at 17 would have left a
  // three-cell gap, and the jump arc is tuned to clear two.
  islet(-17, 0, 2, TOP);
  islet(16, 3, 2, TOP);
  islet(0, 14, 3, TOP);
  // A lit marker on the far islet, so it reads as somewhere to go.
  put(0, TOP + 1, 14, BLOCK, PALE, MATTE);
  put(0, TOP + 2, 14, BLOCK, POLLEN, GLOW);

  return [...cells.values()];
}

/** Above the island's centre, so the player drops onto grass. */
export const ISLAND_SPAWN: Vec3 = [0.5, TOP + 2.4, 0.5];

export function islandWorldDoc(
  id: string,
  ownerId: string,
  name = "Sky Yard"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: ISLAND_SPAWN,
    sky: 1,
    parts: islandParts(),
    props: [],
  };
}
