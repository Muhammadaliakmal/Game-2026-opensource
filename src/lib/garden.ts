import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * "Quiet Garden" — the wandering world.
 *
 * A counterweight to the parkour course: no goal, no failure state, nothing to
 * clear. Rolling hills, a lake, groves, lantern-lit paths. Townscaper's design
 * lesson (SPEC §9 #2) is that removing the score is what lets the visuals and
 * the act of looking around be the whole point — so this world deliberately
 * has no course through it.
 *
 * Generation is fully deterministic. The world is regenerated from code on
 * every request rather than stored, so anything random here would mean the
 * garden quietly rearranged itself between the editor and play mode.
 */

const BLOCK: Shape = 0;
const SLAB: Shape = 1;

// Palette indices (see PALETTE in worlddoc.ts).
const GRASS = 24; // #22c55e
const GRASS_DEEP = 23; // #10b981
const GRASS_LIGHT = 25; // #84cc16
const MOSS = 26; // #a3e635
const DIRT = 27; // #78350f
const STONE = 28; // #57534e
const SAND = 29; // #a8a29e
const WATER = 20; // #0ea5e9
const SHALLOW = 21; // #06b6d4
const BLOSSOM = 13; // #f472b6
const PETAL = 31; // #ffffff
const POLLEN = 6; // #fef08a
const LAVENDER = 16; // #a855f7

const MATTE = 0;
const GLOSSY = 1;
const GLOW = 3;

const HALF = 26; // world spans -HALF..HALF on both axes
const WATER_LEVEL = 2;

/** 32-bit integer hash — the lattice for value noise. */
function hash2(x: number, z: number, seed: number): number {
  let h =
    Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep-interpolated value noise. */
function noise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);

  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Three octaves is enough for hills that read as landscape rather than static. */
function fbm(x: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < 3; o++) {
    sum += noise2(x * freq, z * freq, seed + o * 977) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Terrain height at a column, in cells. */
function heightAt(x: number, z: number): number {
  const base = fbm(x / 22, z / 22, 1337);
  const detail = fbm(x / 7, z / 7, 4242) * 0.22;

  // Push the middle down into a basin so the lake has somewhere to sit.
  const d = Math.hypot(x + 4, z + 3) / HALF;
  const basin = Math.max(0, 1 - d * 1.9) * 3.4;

  return Math.max(0, Math.round(base * 9 + detail * 6 - basin));
}

export function gardenParts(): PartTuple[] {
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
    cells.set(`${x},${y},${z}`, [x, y, z, shape, color, finish, rot]);
  };

  const heights = new Map<string, number>();
  const h = (x: number, z: number) => heights.get(`${x},${z}`) ?? 0;

  // ── Terrain ─────────────────────────────────────────────────────────────
  for (let x = -HALF; x <= HALF; x++) {
    for (let z = -HALF; z <= HALF; z++) {
      const top = heightAt(x, z);
      heights.set(`${x},${z}`, top);

      const underwater = top <= WATER_LEVEL;
      // Shore band reads as sand; higher ground picks a green by altitude, so
      // the hills band naturally instead of being one flat colour.
      let surface: number;
      if (underwater) surface = SAND;
      else if (top <= WATER_LEVEL + 1) surface = SAND;
      else if (top >= 7) surface = STONE;
      else if (top >= 5) surface = GRASS_DEEP;
      else surface = hash2(x, z, 91) > 0.82 ? GRASS_LIGHT : GRASS;

      put(x, top, z, BLOCK, surface, MATTE);
      // One layer of substrate, so cliff faces aren't see-through.
      if (top > 0) put(x, top - 1, z, BLOCK, underwater ? SAND : DIRT, MATTE);

      // Water fills every column below the waterline.
      if (underwater) {
        for (let y = top + 1; y <= WATER_LEVEL; y++) {
          put(x, y, z, BLOCK, y === WATER_LEVEL ? WATER : SHALLOW, GLOSSY);
        }
      }
    }
  }

  const onLand = (x: number, z: number) =>
    x > -HALF && x < HALF && z > -HALF && z < HALF && h(x, z) > WATER_LEVEL + 1;

  /** Ground is flat enough here that a tree won't hang off a cliff. */
  const isFlat = (x: number, z: number) => {
    const y = h(x, z);
    return (
      Math.abs(h(x + 1, z) - y) <= 1 &&
      Math.abs(h(x - 1, z) - y) <= 1 &&
      Math.abs(h(x, z + 1) - y) <= 1 &&
      Math.abs(h(x, z - 1) - y) <= 1
    );
  };

  // ── Trees ───────────────────────────────────────────────────────────────
  // Blob canopies rather than a fixed shape, so no two trees read as clones.
  const tree = (x: number, z: number, height: number, leaf: number) => {
    const base = h(x, z) + 1;
    for (let i = 0; i < height; i++) put(x, base + i, z, BLOCK, DIRT, MATTE);

    const crown = base + height - 1;
    const r = 2;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const dist = Math.hypot(dx, dz, dy * 1.3);
          if (dist > r + 0.35) continue;
          // Nibble the silhouette so the canopy isn't an obvious sphere.
          if (hash2(x + dx * 31, z + dz * 17 + dy * 7, 55) > 0.78) continue;
          put(x + dx, crown + dy, z + dz, BLOCK, leaf, MATTE);
        }
      }
    }
  };

  for (let x = -HALF + 3; x <= HALF - 3; x += 1) {
    for (let z = -HALF + 3; z <= HALF - 3; z += 1) {
      if (!onLand(x, z) || !isFlat(x, z)) continue;
      // Sparse, deterministic scatter with a minimum spacing from the lattice.
      if (hash2(x, z, 707) < 0.975) continue;
      if (Math.hypot(x, z) < 7) continue; // keep the spawn clearing open

      const roll = hash2(x, z, 808);
      const leaf = roll > 0.8 ? BLOSSOM : roll > 0.55 ? MOSS : GRASS_DEEP;
      tree(x, z, 3 + Math.floor(hash2(x, z, 909) * 3), leaf);
    }
  }

  // ── Wildflowers ─────────────────────────────────────────────────────────
  // Slabs, so they're ankle-height decoration you walk over, not obstacles.
  for (let x = -HALF + 1; x <= HALF - 1; x++) {
    for (let z = -HALF + 1; z <= HALF - 1; z++) {
      if (!onLand(x, z)) continue;
      const r = hash2(x, z, 313);
      if (r < 0.955) continue;
      const petal =
        r > 0.99 ? LAVENDER : r > 0.978 ? BLOSSOM : r > 0.967 ? POLLEN : PETAL;
      put(x, h(x, z) + 1, z, SLAB, petal, MATTE);
    }
  }

  // ── Spawn deck + lantern path ───────────────────────────────────────────
  // A small platform at origin so you always arrive somewhere level, then a
  // path of pale stone wandering off it toward the lake.
  const deckY = h(0, 0) + 1;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      if (Math.hypot(dx, dz) > 3.4) continue;
      put(dx, deckY, dz, BLOCK, SAND, MATTE);
    }
  }

  let px = 3;
  let pz = 0;
  for (let step = 0; step < 34; step++) {
    const y = h(px, pz);
    for (let w = -1; w <= 1; w++) put(px, y + 1, pz + w, SLAB, SAND, MATTE);
    // Lanterns every seventh step, on a short post.
    if (step % 7 === 3) {
      put(px, y + 1, pz + 2, BLOCK, DIRT, MATTE);
      put(px, y + 2, pz + 2, BLOCK, POLLEN, GLOW);
    }
    px += 1;
    pz += hash2(px, step, 44) > 0.6 ? 1 : hash2(px, step, 45) > 0.6 ? -1 : 0;
  }

  return [...cells.values()];
}

/** Above the spawn deck, so the player drops onto it. */
export const GARDEN_SPAWN: Vec3 = [0, heightAt(0, 0) + 3, 0];

export function gardenWorldDoc(
  id: string,
  ownerId: string,
  name = "Quiet Garden"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: GARDEN_SPAWN,
    sky: 1,
    parts: gardenParts(),
    props: [],
  };
}
