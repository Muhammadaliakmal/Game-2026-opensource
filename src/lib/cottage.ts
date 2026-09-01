import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * "The Cottage" — a building you can walk into.
 *
 * The starter world that teaches the shapes. The course teaches jumping and
 * the island teaches wandering; this one exists to show a new builder what the
 * four primitives are actually FOR — a ramp roof, slab paths, a wedge gable —
 * because "block, slab, ramp, wedge" means nothing until you have seen them
 * assembled into something.
 *
 * It is also the easiest world to remix: everything here is one or two blocks
 * away from being changed into your own house.
 *
 * The yard sits on the grid floor (y=0), so the whole world is inside the
 * buildable area and every part can be edited after a remix.
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
const PLASTER = 1;
const BEAM = 27;
const ROOF = 11;
const ROOF_DEEP = 10;
const GLASS = 21;
const POLLEN = 6;
const BLOSSOM = 13;
const SLATE = 3;

const MATTE = 0;
const GLOSSY = 1;
const GLOW = 3;

// Yard extent, and the house footprint inside it.
const YX = 11;
const YZ = 9;
const HX0 = -5;
const HX1 = 5; // 11 wide
const HZ0 = -4;
const HZ1 = 4; // 9 deep
const WALL_TOP = 4; // walls occupy y = 1..4

export function cottageParts(): PartTuple[] {
  const cells = new Map<string, PartTuple>();
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
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
    cells.set(key(x, y, z), [x, y, z, shape, color, finish, rot]);
  };
  /** Openings are cut after the fact — simpler to read than a wall loop full
   *  of exceptions, and it is how you would do it in the editor too. */
  const cut = (x: number, y: number, z: number) => cells.delete(key(x, y, z));

  // ── Yard ────────────────────────────────────────────────────────────────
  for (let x = -YX; x <= YX; x++) {
    for (let z = -YZ; z <= YZ; z++) {
      const edge = Math.abs(x) === YX || Math.abs(z) === YZ;
      put(x, 0, z, BLOCK, edge ? GRASS_DEEP : GRASS, MATTE);
    }
  }

  // Floorboards inside the footprint, so the interior reads as a room.
  for (let x = HX0 + 1; x <= HX1 - 1; x++) {
    for (let z = HZ0 + 1; z <= HZ1 - 1; z++) {
      put(x, 0, z, BLOCK, BEAM, MATTE);
    }
  }

  // ── Walls ───────────────────────────────────────────────────────────────
  for (let y = 1; y <= WALL_TOP; y++) {
    for (let x = HX0; x <= HX1; x++) {
      put(x, y, HZ0, BLOCK, PLASTER, MATTE);
      put(x, y, HZ1, BLOCK, PLASTER, MATTE);
    }
    for (let z = HZ0; z <= HZ1; z++) {
      put(HX0, y, z, BLOCK, PLASTER, MATTE);
      put(HX1, y, z, BLOCK, PLASTER, MATTE);
    }
  }

  // Corner posts, so the box reads as a built thing rather than an extrusion.
  for (let y = 1; y <= WALL_TOP; y++) {
    put(HX0, y, HZ0, BLOCK, BEAM, MATTE);
    put(HX1, y, HZ0, BLOCK, BEAM, MATTE);
    put(HX0, y, HZ1, BLOCK, BEAM, MATTE);
    put(HX1, y, HZ1, BLOCK, BEAM, MATTE);
  }

  // Doorway on the front (-z) wall: two cells wide, two high, so you walk
  // straight in rather than having to line yourself up with a 1-wide gap.
  for (const x of [-1, 0]) {
    cut(x, 1, HZ0);
    cut(x, 2, HZ0);
  }
  put(-1, 3, HZ0, BLOCK, BEAM, MATTE);
  put(0, 3, HZ0, BLOCK, BEAM, MATTE);

  // Windows: glass rather than holes, so the shell stays weatherproof and the
  // glossy finish has somewhere to show up.
  const window = (x: number, z: number, along: "x" | "z") => {
    for (let i = 0; i < 2; i++) {
      const wx = along === "x" ? x + i : x;
      const wz = along === "z" ? z + i : z;
      put(wx, 2, wz, BLOCK, GLASS, GLOSSY);
      put(wx, 3, wz, BLOCK, GLASS, GLOSSY);
    }
  };
  window(2, HZ0, "x");
  window(-3, HZ1, "x");
  window(HX0, -1, "z");
  window(HX1, 1, "z");

  // ── Roof ────────────────────────────────────────────────────────────────
  // A gable, ridge running along x. Ramps rise toward +x at rot 0, so rot 3
  // rises toward +z and rot 1 rises toward -z — which is what makes the two
  // slopes lean into each other instead of both facing the same way.
  const eaveX0 = HX0 - 1;
  const eaveX1 = HX1 + 1;
  for (let i = 0; i < 4; i++) {
    const y = WALL_TOP + 1 + i;
    for (let x = eaveX0; x <= eaveX1; x++) {
      put(x, y, HZ0 + i, RAMP, i === 0 ? ROOF_DEEP : ROOF, MATTE, 3);
      put(x, y, HZ1 - i, RAMP, i === 0 ? ROOF_DEEP : ROOF, MATTE, 1);
    }
  }
  // Ridge cap.
  for (let x = eaveX0; x <= eaveX1; x++) {
    put(x, WALL_TOP + 5, 0, SLAB, ROOF_DEEP, MATTE);
  }

  // Chimney, breaking the roofline.
  for (let y = WALL_TOP + 1; y <= WALL_TOP + 7; y++) {
    put(HX1 - 2, y, -2, BLOCK, STONE, MATTE);
  }
  put(HX1 - 2, WALL_TOP + 8, -2, SLAB, SLATE, MATTE);

  // ── Path, fence and garden ──────────────────────────────────────────────
  // Slab path from the gate to the door.
  for (let z = HZ0 - 1; z >= -YZ + 1; z--) {
    put(-1, 1, z, SLAB, PALE, MATTE);
    put(0, 1, z, SLAB, PALE, MATTE);
  }

  // Lanterns either side of the door.
  for (const x of [-3, 2]) {
    put(x, 1, HZ0 - 2, BLOCK, STONE, MATTE);
    put(x, 2, HZ0 - 2, BLOCK, POLLEN, GLOW);
  }

  // Picket fence with a gate opposite the path.
  for (let x = -YX; x <= YX; x++) {
    if (x === -1 || x === 0) continue; // the gate
    put(x, 1, -YZ, BLOCK, PALE, MATTE);
    put(x, 1, YZ, BLOCK, PALE, MATTE);
  }
  for (let z = -YZ; z <= YZ; z++) {
    put(-YX, 1, z, BLOCK, PALE, MATTE);
    put(YX, 1, z, BLOCK, PALE, MATTE);
  }

  // A tree and a flower bed, so the yard is not bare grass.
  for (let y = 1; y <= 3; y++) put(-8, y, 5, BLOCK, DIRT, MATTE);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 2; dy++) {
        if (Math.hypot(dx, dz, dy * 1.3) > 2.3) continue;
        put(-8 + dx, 4 + dy, 5 + dz, BLOCK, GRASS_DEEP, MATTE);
      }
    }
  }
  for (let x = 5; x <= 9; x++) {
    put(x, 1, 6, SLAB, x % 2 === 0 ? BLOSSOM : POLLEN, MATTE);
    put(x, 1, 7, SLAB, x % 2 === 0 ? POLLEN : BLOSSOM, MATTE);
  }

  return [...cells.values()];
}

/** On the path, facing the front door. */
export const COTTAGE_SPAWN: Vec3 = [-0.5, 2.4, -7.5];

export function cottageWorldDoc(
  id: string,
  ownerId: string,
  name = "The Cottage"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: COTTAGE_SPAWN,
    sky: 0,
    parts: cottageParts(),
    props: [],
  };
}
