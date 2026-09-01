import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * The default parkour course every new world starts from.
 *
 * SPEC §9 #5: never open a new world onto a blank void — blank-canvas paralysis
 * is a known drop-off point. A course also means Play mode has something to
 * *do* the first time someone presses it, which is what sells the build→play
 * loop before the player has built anything themselves.
 *
 * Difficulty is deliberately conservative because the whole course has to clear
 * FEEL's jump arc: with jumpVel 5.5 the character rises ~1.5 units, so every
 * rise here is at most 1 cell, and gaps are at most 2 cells (a walk-speed jump
 * covers ~2.2, a run-speed one roughly double). Nothing needs a running start.
 */

// Shapes
const BLOCK: Shape = 0;
const SLAB: Shape = 1;
const RAMP: Shape = 2;

// Palette indices (see PALETTE in worlddoc.ts) chosen to match the Neon Voxel look.
const INDIGO = 18;
const VIOLET = 17;
const CYAN = 21;
const TEAL = 22;
const ACID = 26;
const PINK = 14;

// Finishes
const MATTE = 0;
const GLOSSY = 1;
const METAL = 2;
const GLOW = 3;

/** Builds the course and returns its parts. */
export function parkourParts(): PartTuple[] {
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
  const fill = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: number,
    finish: number,
    shape: Shape = BLOCK
  ) => {
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < d; k++) put(x + i, y, z + k, shape, color, finish);
    }
  };
  const outline = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    color: number,
    finish: number
  ) => {
    for (let i = 0; i < w; i++) {
      put(x + i, y, z, BLOCK, color, finish);
      put(x + i, y, z + d - 1, BLOCK, color, finish);
    }
    for (let k = 0; k < d; k++) {
      put(x, y, z + k, BLOCK, color, finish);
      put(x + w - 1, y, z + k, BLOCK, color, finish);
    }
  };

  // ── 1. Start plaza ──────────────────────────────────────────────────────
  // Wide and unmissable, with a glowing rim so the play area reads instantly.
  fill(-5, 0, -5, 11, 11, INDIGO, MATTE);
  outline(-5, 0, -5, 11, 11, CYAN, GLOW);
  // A raised launch lip pointing at the first jump.
  fill(4, 1, -2, 1, 5, VIOLET, GLOSSY, SLAB);

  // ── 2. Stepping stones — rise 1, gap 2 ─────────────────────────────────
  // Six 2×2 pads climbing away from the plaza. The last one glows: it's the
  // visual "you made it" beat before the beam.
  let x = 9;
  for (let i = 0; i < 6; i++) {
    const y = 1 + i;
    const last = i === 5;
    fill(x, y, -1, 2, 2, last ? TEAL : CYAN, last ? GLOW : GLOSSY);
    x += 4; // 2 wide + 2 gap
  }

  // ── 3. Balance beam ─────────────────────────────────────────────────────
  // One block wide, at the height the stones ended on. Every third block glows
  // so the line stays readable against the void.
  const beamY = 6;
  const beamStart = x;
  for (let i = 0; i < 14; i++) {
    const glow = i % 3 === 0;
    put(beamStart + i, beamY, 0, BLOCK, glow ? PINK : VIOLET, glow ? GLOW : MATTE);
  }
  x = beamStart + 14;

  // ── 4. Landing terrace + ramp descent ───────────────────────────────────
  fill(x, beamY, -3, 5, 7, INDIGO, MATTE);
  outline(x, beamY, -3, 5, 7, CYAN, GLOW);
  // Ramps rise toward +x in local space, so rot 2 turns them into a descent.
  for (let i = 0; i < 4; i++) {
    put(x + 5 + i, beamY - 1 - i, 0, RAMP, TEAL, METAL, 2);
    put(x + 5 + i, beamY - 1 - i, 1, RAMP, TEAL, METAL, 2);
  }
  x = x + 9;

  // ── 5. Floating islands — the run-up section ───────────────────────────
  // Alternating z offsets so the player has to turn mid-course rather than
  // holding W in a straight line.
  const islands: Array<[number, number, number]> = [
    [x + 2, 2, -4],
    [x + 7, 3, 2],
    [x + 12, 3, -3],
    [x + 17, 4, 1],
  ];
  for (const [ix, iy, iz] of islands) {
    fill(ix, iy, iz, 3, 3, VIOLET, GLOSSY);
    put(ix + 1, iy, iz + 1, BLOCK, CYAN, GLOW);
  }

  // ── 6. Staircase to the finish ─────────────────────────────────────────
  const stairX = x + 22;
  for (let i = 0; i < 5; i++) {
    fill(stairX + i, 4 + i, 0, 1, 3, INDIGO, MATTE);
  }

  // ── 7. Finish tower ─────────────────────────────────────────────────────
  const fx = stairX + 5;
  const fy = 8;
  fill(fx, fy, -2, 5, 5, INDIGO, MATTE);
  outline(fx, fy, -2, 5, 5, ACID, GLOW);
  // A little podium you can actually stand on top of.
  fill(fx + 1, fy + 1, -1, 3, 3, VIOLET, GLOSSY);
  fill(fx + 2, fy + 2, 0, 1, 1, ACID, GLOW);

  return [...cells.values()];
}

/** Spawn sits one cell above the plaza surface so the player drops onto it. */
export const PARKOUR_SPAWN: Vec3 = [0, 2, 0];

/** A new world: the parkour course, ready to play or to build on top of. */
export function parkourWorldDoc(
  id: string,
  ownerId: string,
  name = "Untitled World"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: PARKOUR_SPAWN,
    sky: 0,
    parts: parkourParts(),
    props: [],
  };
}
