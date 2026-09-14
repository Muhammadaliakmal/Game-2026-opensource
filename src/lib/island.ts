import { surfaceIndex } from "./surface-dressing";
import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * "Sky Yard" — the wandering world.
 *
 * A counterweight to the obstacle course: no goal, no failure state, nothing
 * to clear. An island in the void with woods, a headland to climb, a standing
 * arch and a lantern path, ringed by chains of islets close enough to hop to.
 * Townscaper's design lesson (SPEC §9 #2) is that removing the score is what
 * lets the act of looking around be the point.
 *
 * Which is exactly why it is no longer small. A world with nothing to achieve
 * has only one resource — distance — and at the original 25x19 you could see
 * all of it from the spawn, so there was nothing left to walk toward. The
 * island is now a little under three times the area, with a hill high enough
 * to change what you can see from the top of it and outlying rocks pushed far
 * enough out that reaching one is a decision rather than a step.
 *
 * Every cell here is honest ground you can stand on: there is no decorative
 * water volume, because a solid block that looks like water is a surface you
 * walk on top of, which reads as a bug rather than a pond.
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

const BARK = surfaceIndex("bark");

/**
 * Island base surface. Everything hangs below it, and nothing goes under y=0 —
 * parts below the grid floor cannot be edited once the world is remixed.
 *
 * Raised from 6 to 8 along with the island, because the body now tapers over a
 * longer run: at the old TOP the deepest cells under the middle would have
 * been clipped away by that y=0 floor, leaving the underside flat.
 */
const TOP = 8;
const RX = 21;
const RZ = 16;

/**
 * The headland, in the north-west quarter.
 *
 * A flat table this wide reads as a car park. One broad rise, shaped by a
 * cosine so its skirt eases out instead of ending in a step, gives the island
 * a high side to climb and a low side to look up at — and gives the arch and
 * the far islets something to be seen over. Radius and height are chosen so no
 * single course up it exceeds the one-cell rise the jump arc is tuned for.
 */
const HILL_X = -11;
const HILL_Z = -8;
const HILL_R = 9;
const HILL_H = 5;

/** 32-bit integer hash, so the scatter is stable without being obviously regular. */
function hash2(x: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Cells of land above TOP at a given column. 0 everywhere off the headland. */
function relief(x: number, z: number): number {
  const d = Math.hypot(x - HILL_X, z - HILL_Z) / HILL_R;
  if (d >= 1) return 0;
  return Math.round(((Math.cos(d * Math.PI) + 1) / 2) * HILL_H);
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
    rot = 0,
    /** A surface, where the colour alone would be dressed as something else. */
    texture?: number
  ) => {
    if (y < 0) return;
    const part: PartTuple = [x, y, z, shape, color, finish, rot];
    if (texture) part.push(texture);
    cells.set(`${x},${y},${z}`, part);
  };

  /** Elliptical falloff: 0 at the centre, 1 at the rim, >1 outside. */
  const fall = (x: number, z: number) => (x / RX) ** 2 + (z / RZ) ** 2;

  /** The surface y of the island at a column — TOP plus whatever the hill adds. */
  const surfaceY = (x: number, z: number) => TOP + relief(x, z);

  // ── The island ──────────────────────────────────────────────────────────
  // A grass cap over a body of dirt and stone that tapers to a point, so the
  // underside reads as a torn-off chunk of ground rather than a flat slab.
  for (let x = -RX; x <= RX; x++) {
    for (let z = -RZ; z <= RZ; z++) {
      const e = fall(x, z);
      if (e > 1) continue;

      const top = surfaceY(x, z);
      const rim = e > 0.72;
      const surface = rim
        ? hash2(x, z, 17) > 0.7
          ? MOSS
          : GRASS_DEEP
        : hash2(x, z, 17) > 0.86
          ? GRASS_DEEP
          : GRASS;
      put(x, top, z, BLOCK, surface, MATTE);

      // Thickest under the middle, one block at the rim, plus however far the
      // headland has been lifted. Filling down from `top` rather than from a
      // fixed TOP is what keeps the hill solid instead of a floating shell.
      const depth = 1 + Math.round((1 - e) * 4) + (top - TOP);
      for (let d = 1; d <= depth; d++) {
        put(x, top - d, z, BLOCK, d <= 1 ? DIRT : STONE, MATTE);
      }
    }
  }

  // ── Trees ───────────────────────────────────────────────────────────────
  const tree = (x: number, z: number, height: number, leaf: number) => {
    // Rooted on the ground that is actually there, so a tree on the headland
    // is not left standing five cells up on nothing.
    const base = surfaceY(x, z);
    // The same brown as the soil, so the dressing in surface-dressing.ts
    // cannot tell them apart — the trunk says what it is itself.
    for (let i = 1; i <= height; i++) put(x, base + i, z, BLOCK, DIRT, MATTE, 0, BARK);

    const crown = base + height;
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

  // Placed by hand rather than scattered by hash: a wood you can lose sight of
  // the path in wants clumps and clearings, and noise gives you neither. The
  // dense group is on the hill's flank, which is also the only part of the
  // island you cannot see into from the spawn.
  tree(-14, -10, 4, GRASS_DEEP);
  tree(-10, -12, 3, MOSS);
  tree(-8, -6, 5, GRASS_DEEP);
  tree(-15, -4, 4, MOSS);
  tree(-13, 3, 4, GRASS_DEEP);
  tree(-6, 8, 3, MOSS);
  tree(-11, 10, 4, BLOSSOM);
  tree(4, 9, 3, BLOSSOM);
  tree(11, 6, 4, GRASS_DEEP);
  tree(14, -2, 4, GRASS_DEEP);
  tree(9, -9, 3, BLOSSOM);
  tree(16, 7, 3, MOSS);
  tree(-2, -13, 4, GRASS_DEEP);

  // ── Standing arch ───────────────────────────────────────────────────────
  // Something to walk under and orient by: a horizon landmark on a world with
  // no goal is what stops wandering turning into being lost.
  for (let y = 1; y <= 5; y++) {
    put(-2, TOP + y, -11, BLOCK, PALE, MATTE);
    put(4, TOP + y, -11, BLOCK, PALE, MATTE);
  }
  for (let x = -2; x <= 4; x++) put(x, TOP + 6, -11, BLOCK, PALE, MATTE);
  put(1, TOP + 7, -11, BLOCK, POLLEN, GLOW);

  // A second landmark on the far side, so the arch is a bearing rather than
  // the only thing worth walking to. Three standing stones and a lit cap:
  // enough to read from across the island, cheap enough to be an aside.
  for (const [sx, sz, h] of [
    [15, 12, 4],
    [17, 14, 3],
    [13, 14, 3],
  ] as const) {
    for (let y = 1; y <= h; y++) put(sx, TOP + y, sz, BLOCK, STONE, MATTE);
    put(sx, TOP + h + 1, sz, BLOCK, LAVENDER, GLOW);
  }

  // ── Lantern path ────────────────────────────────────────────────────────
  // Pale slabs wandering from the arch across the island, lit every few steps.
  let px = 1;
  let pz = -10;
  for (let step = 0; step < 28; step++) {
    // Laid on whatever the ground does, so where the path crosses the hill's
    // skirt it climbs with it instead of burying itself in it.
    const y = surfaceY(px, pz) + 1;
    if (fall(px, pz) <= 1) {
      put(px, y, pz, SLAB, PALE, MATTE);
      if (step % 5 === 2) {
        put(px + 1, y, pz, BLOCK, DIRT, MATTE);
        put(px + 1, y + 1, pz, BLOCK, POLLEN, GLOW);
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
      const y = surfaceY(x, z) + 1;
      if (cells.has(`${x},${y},${z}`)) continue;
      const r = hash2(x, z, 313);
      // Thinned from 0.94 as the island grew. The same density over nearly
      // three times the area is a meadow, and a meadow stops reading as
      // detail — it reads as the ground texture.
      if (r < 0.968) continue;
      const petal =
        r > 0.994 ? LAVENDER : r > 0.986 ? BLOSSOM : r > 0.977 ? POLLEN : WHITE;
      put(x, y, z, SLAB, petal, MATTE);
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

  /**
   * A line of islets stepping away from the coast.
   *
   * A single rock offshore is a dead end you look at once. A chain — each hop
   * still inside the jump arc, each rock further from anything — is somewhere
   * to go, and the walk back is the only stake a world with no failure state
   * has to offer. The first is the largest so the step off the island itself
   * is the safest one.
   *
   * Steps are sized to leave a two-cell gap after the radii are accounted for,
   * which is what the arc is tuned to clear.
   */
  const chain = (
    fromX: number,
    fromZ: number,
    stepX: number,
    stepZ: number,
    count: number,
    y = TOP
  ) => {
    for (let i = 0; i < count; i++) {
      islet(fromX + stepX * i, fromZ + stepZ * i, i === 0 ? 3 : 2, y);
    }
  };

  // Anchored off the rim the ellipse actually has at that z, not off RX: at
  // z=12 the island only reaches x=17, so a chain starting at 23 would have
  // left a gap the arc cannot clear.
  chain(-26, 0, -6, -1, 3);
  chain(23, 4, 6, 2, 3);
  chain(0, 22, 1, 6, 3);
  chain(-13, 21, -3, 5, 2);
  // One pair climbing instead of running flat, for somewhere that is up.
  islet(19, -14, 3, TOP + 2);
  islet(25, -19, 2, TOP + 5);

  // Lit markers on the last rock of each chain, so they read from the shore as
  // somewhere to go rather than as scenery you notice by falling off it.
  for (const [mx, mz, my] of [
    [-38, -2, TOP],
    [35, 8, TOP],
    [2, 34, TOP],
    [-19, 31, TOP],
    [25, -19, TOP + 5],
  ] as const) {
    put(mx, my + 1, mz, BLOCK, PALE, MATTE);
    put(mx, my + 2, mz, BLOCK, POLLEN, GLOW);
  }

  return [...cells.values()];
}

/** Above the island's centre, so the player drops onto grass — clear of the
 *  headland, which starts well to the north-west. */
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
