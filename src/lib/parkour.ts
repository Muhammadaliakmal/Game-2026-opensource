import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * The default parkour course every new world starts from.
 *
 * SPEC §9 #5: never open a new world onto a blank void — blank-canvas paralysis
 * is a known drop-off point. A course also means Play mode has something to
 * *do* the first time someone presses it, which is what sells the build→play
 * loop before the player has built anything themselves.
 *
 * Tuned to be forgiving. The whole course has to clear FEEL's jump arc — with
 * jumpVel 5.5 the character rises ~1.5 units — so every rise is at most 1 cell
 * and every gap at most 2. Beyond that the landing surfaces are deliberately
 * generous: 3x3 pads and a 3-wide beam rather than the minimum that would fit,
 * because on a first play the failure you remember is the one where you made
 * the jump and slid off the edge.
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
  // Five 3×3 pads climbing away from the plaza. The last one glows: it's the
  // visual "you made it" beat before the beam.
  let x = 9;
  for (let i = 0; i < 5; i++) {
    const y = 1 + i;
    const last = i === 4;
    fill(x, y, -2, 3, 3, last ? TEAL : CYAN, last ? GLOW : GLOSSY);
    x += 5; // 3 wide + 2 gap
  }

  // ── 3. Walkway ──────────────────────────────────────────────────────────
  // Three wide, at the height the stones ended on — wide enough to run without
  // aiming. Glowing rails every third block keep the line readable against the
  // void without narrowing the surface you actually land on.
  const beamY = 5;
  const beamStart = x;
  for (let i = 0; i < 12; i++) {
    const rail = i % 3 === 0;
    put(beamStart + i, beamY, 0, BLOCK, VIOLET, MATTE);
    put(beamStart + i, beamY, -1, BLOCK, rail ? PINK : VIOLET, rail ? GLOW : MATTE);
    put(beamStart + i, beamY, 1, BLOCK, rail ? PINK : VIOLET, rail ? GLOW : MATTE);
  }
  x = beamStart + 12;

  // ── 4. Landing terrace + ramp descent ───────────────────────────────────
  fill(x, beamY, -3, 6, 7, INDIGO, MATTE);
  outline(x, beamY, -3, 6, 7, CYAN, GLOW);
  // Ramps rise toward +x in local space, so rot 2 turns them into a descent.
  for (let i = 0; i < 4; i++) {
    put(x + 6 + i, beamY - 1 - i, -1, RAMP, TEAL, METAL, 2);
    put(x + 6 + i, beamY - 1 - i, 0, RAMP, TEAL, METAL, 2);
    put(x + 6 + i, beamY - 1 - i, 1, RAMP, TEAL, METAL, 2);
  }
  x = x + 10;

  // ── 5. Floating islands — the run-up section ───────────────────────────
  // Alternating z offsets so the player has to turn mid-course rather than
  // holding W in a straight line.
  const islands: Array<[number, number, number]> = [
    [x + 2, 1, -4],
    [x + 8, 2, 1],
    [x + 14, 2, -3],
    [x + 20, 3, 1],
  ];
  for (const [ix, iy, iz] of islands) {
    fill(ix, iy, iz, 4, 4, VIOLET, GLOSSY);
    outline(ix, iy, iz, 4, 4, CYAN, GLOW);
  }

  // ── 6. Staircase to the finish ─────────────────────────────────────────
  const stairX = x + 25;
  for (let i = 0; i < 5; i++) {
    fill(stairX + i, 3 + i, -1, 1, 4, INDIGO, MATTE);
  }

  // ── 7. Finish tower ─────────────────────────────────────────────────────
  const fx = stairX + 5;
  const fy = 7;
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
