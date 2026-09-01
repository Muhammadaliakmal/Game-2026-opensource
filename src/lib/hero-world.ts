import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * The little world on the landing page.
 *
 * UI spec §3.1: the hero is a live scene, not text. A visitor should be
 * playing with the product before they have read a word, so this is a real
 * Blockworld world rendered by the real renderer — small enough to load
 * instantly and already built, because an empty grid on a landing page teaches
 * nothing.
 *
 * Kept deliberately tiny (a few hundred parts). It sits above the fold on a
 * marketing page, which is the worst possible place to spend a frame budget.
 */

const BLOCK: Shape = 0;
const SLAB: Shape = 1;
const RAMP: Shape = 2;

// Palette indices (see PALETTE in worlddoc.ts).
const GRASS = 24;
const GRASS_DEEP = 23;
const DIRT = 27;
const STONE = 28;
const PALE = 29;
const SIGNAL = 8;
const BLOSSOM = 13;
const VIOLET = 17;

const MATTE = 0;
const GLOSSY = 1;
const GLOW = 3;

const RX = 7;
const RZ = 6;
const TOP = 2;

export function heroParts(): PartTuple[] {
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

  // ── Island ──────────────────────────────────────────────────────────────
  for (let x = -RX; x <= RX; x++) {
    for (let z = -RZ; z <= RZ; z++) {
      const e = (x / RX) ** 2 + (z / RZ) ** 2;
      if (e > 1) continue;
      put(x, TOP, z, BLOCK, e > 0.7 ? GRASS_DEEP : GRASS, MATTE);
      put(x, TOP - 1, z, BLOCK, DIRT, MATTE);
      if (e < 0.45) put(x, TOP - 2, z, BLOCK, STONE, MATTE);
    }
  }

  // ── Ramp up to a plinth ─────────────────────────────────────────────────
  // The ramp is the point: it is the shape that most obviously is not a cube,
  // and seeing one in the hero says "this is a builder" faster than a caption.
  for (let i = 0; i < 3; i++) {
    for (let z = -1; z <= 1; z++) {
      put(1 + i, TOP + 1 + i, z, RAMP, PALE, MATTE);
      // Fill underneath so the ramp reads as solid rather than floating.
      for (let y = TOP + 1; y < TOP + 1 + i; y++) {
        put(1 + i, y, z, BLOCK, PALE, MATTE);
      }
    }
  }
  for (let x = 4; x <= 6; x++) {
    for (let z = -1; z <= 1; z++) {
      for (let y = TOP + 1; y <= TOP + 3; y++) {
        put(x, y, z, BLOCK, y === TOP + 3 ? VIOLET : PALE, y === TOP + 3 ? GLOSSY : MATTE);
      }
    }
  }
  put(5, TOP + 4, 0, BLOCK, SIGNAL, GLOW);

  // ── A tree and a little colour ──────────────────────────────────────────
  for (let y = 1; y <= 3; y++) put(-4, TOP + y, 2, BLOCK, DIRT, MATTE);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 1; dy++) {
        if (Math.hypot(dx, dz, dy * 1.4) > 2.1) continue;
        put(-4 + dx, TOP + 3 + dy, 2 + dz, BLOCK, GRASS_DEEP, MATTE);
      }
    }
  }
  for (const [x, z] of [
    [-2, -3],
    [0, 4],
    [-5, -1],
    [2, 3],
  ]) {
    put(x, TOP + 1, z, SLAB, BLOSSOM, MATTE);
  }

  return [...cells.values()];
}

export const HERO_SPAWN: Vec3 = [0.5, TOP + 2.4, 0.5];

/** The hero world as a real doc, so a visitor's clicks can follow them in. */
export function heroWorldDoc(
  parts: PartTuple[],
  id: string,
  name = "My first world"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId: "",
    spawn: HERO_SPAWN,
    sky: 0,
    parts,
    props: [],
  };
}
