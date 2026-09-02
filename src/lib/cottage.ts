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
 * The smallholding around it is deliberately larger than the house needs. A
 * starter world's job is to be built ON, and a yard that ends a few steps past
 * the walls is a yard that says "finished" — the first thing a new builder
 * should see is somewhere obviously empty, at ground level, already fenced,
 * with a second building nearby to show that more than one is allowed.
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
const YX = 24;
const YZ = 19;
const HX0 = -6;
const HX1 = 6; // 13 wide
const HZ0 = -5;
const HZ1 = 5; // 11 deep
const WALL_TOP = 4; // walls occupy y = 1..4

/**
 * How many ramp courses the gable needs to close.
 *
 * The two slopes climb toward the ridge from opposite eaves, one course per
 * cell, so a house 2n+1 deep needs exactly n of them. Deriving it rather than
 * writing 4 is what lets the footprint above change without leaving a slot
 * open along the roofline.
 */
const ROOF_COURSES = (HZ1 - HZ0) / 2;

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
  window(-4, HZ0, "x");
  window(-3, HZ1, "x");
  window(2, HZ1, "x");
  window(HX0, -2, "z");
  window(HX0, 2, "z");
  window(HX1, -2, "z");
  window(HX1, 2, "z");

  // ── Roof ────────────────────────────────────────────────────────────────
  // A gable, ridge running along x. Ramps rise toward +x at rot 0, so rot 3
  // rises toward +z and rot 1 rises toward -z — which is what makes the two
  // slopes lean into each other instead of both facing the same way.
  const eaveX0 = HX0 - 1;
  const eaveX1 = HX1 + 1;
  for (let i = 0; i < ROOF_COURSES; i++) {
    const y = WALL_TOP + 1 + i;
    for (let x = eaveX0; x <= eaveX1; x++) {
      put(x, y, HZ0 + i, RAMP, i === 0 ? ROOF_DEEP : ROOF, MATTE, 3);
      put(x, y, HZ1 - i, RAMP, i === 0 ? ROOF_DEEP : ROOF, MATTE, 1);
    }
  }
  // Ridge cap.
  const ridgeY = WALL_TOP + 1 + ROOF_COURSES;
  for (let x = eaveX0; x <= eaveX1; x++) {
    put(x, ridgeY, 0, SLAB, ROOF_DEEP, MATTE);
  }

  // Chimney, breaking the roofline.
  for (let y = WALL_TOP + 1; y <= ridgeY + 2; y++) {
    put(HX1 - 2, y, -2, BLOCK, STONE, MATTE);
  }
  put(HX1 - 2, ridgeY + 3, -2, SLAB, SLATE, MATTE);

  // ── The barn ────────────────────────────────────────────────────────────
  /**
   * A second, simpler building across the yard.
   *
   * Deliberately cruder than the house — a shed roof rather than a gable, one
   * big opening, no glass. Two buildings in one world is the cheapest way to
   * show that the house is an example rather than the world's one fixed
   * feature, and a lean-to is the shape a first-time builder can actually
   * copy: it is four walls and one run of ramps.
   */
  const BX0 = 11;
  const BX1 = 19;
  const BZ0 = 6;
  const BZ1 = 13;
  for (let x = BX0; x <= BX1; x++) {
    for (let z = BZ0; z <= BZ1; z++) {
      put(x, 0, z, BLOCK, BEAM, MATTE);
    }
  }
  for (let y = 1; y <= 3; y++) {
    for (let x = BX0; x <= BX1; x++) {
      put(x, y, BZ0, BLOCK, BEAM, MATTE);
      put(x, y, BZ1, BLOCK, BEAM, MATTE);
    }
    for (let z = BZ0; z <= BZ1; z++) {
      put(BX0, y, z, BLOCK, BEAM, MATTE);
      put(BX1, y, z, BLOCK, BEAM, MATTE);
    }
  }
  // A cart-wide opening facing the house, three cells of it, full height.
  for (let x = BX0 + 3; x <= BX0 + 5; x++) {
    for (let y = 1; y <= 3; y++) cut(x, y, BZ0);
  }
  // Shed roof: a single pitch toward +z, so it sheds the other way from the
  // house and the two rooflines do not read as copies.
  //
  // Half pitch, not the 45° a run of ramps gives you: a ramp on the cell that
  // steps up and a flat block on the one that does not, which meets the ramp's
  // top edge exactly and keeps the whole barn below the house ridge. Straight
  // ramps all the way would have put its back wall two cells over the chimney.
  for (let i = 0; i <= BZ1 - BZ0; i++) {
    const y = 4 + Math.floor(i / 2);
    for (let x = BX0 - 1; x <= BX1 + 1; x++) {
      if (i % 2 === 0) put(x, y, BZ0 + i, RAMP, ROOF, MATTE, 3);
      else put(x, y, BZ0 + i, BLOCK, ROOF_DEEP, MATTE);
    }
  }

  // ── Path, fence and garden ──────────────────────────────────────────────
  // Slab path from the gate to the door.
  for (let z = HZ0 - 1; z >= -YZ + 1; z--) {
    put(-1, 1, z, SLAB, PALE, MATTE);
    put(0, 1, z, SLAB, PALE, MATTE);
  }
  // And a branch of it running to the barn door, so the yard has a route
  // through it rather than one line down the middle.
  for (let x = 1; x <= BX0 + 4; x++) put(x, 1, -1, SLAB, PALE, MATTE);
  for (let z = 0; z <= BZ0 - 1; z++) put(BX0 + 4, 1, z, SLAB, PALE, MATTE);

  // Lanterns either side of the door, and along the path at intervals.
  for (const x of [-3, 2]) {
    put(x, 1, HZ0 - 2, BLOCK, STONE, MATTE);
    put(x, 2, HZ0 - 2, BLOCK, POLLEN, GLOW);
  }
  for (const z of [-10, -15]) {
    for (const x of [-3, 2]) {
      put(x, 1, z, BLOCK, STONE, MATTE);
      put(x, 2, z, BLOCK, POLLEN, GLOW);
    }
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

  // Trees. One by the house as before, then an orchard row along the west
  // fence — a repeated element at a fixed spacing is the other thing a
  // starter world should demonstrate, because it is what the drag stroke and
  // the copy of a shape are for.
  const tree = (tx: number, tz: number, trunk: number, leaf: number) => {
    for (let y = 1; y <= trunk; y++) put(tx, y, tz, BLOCK, DIRT, MATTE);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (Math.hypot(dx, dz, dy * 1.3) > 2.3) continue;
          put(tx + dx, trunk + 1 + dy, tz + dz, BLOCK, leaf, MATTE);
        }
      }
    }
  };
  tree(-11, 8, 3, GRASS_DEEP);
  for (let i = 0; i < 4; i++) {
    tree(-19, -12 + i * 8, 3, i % 2 === 0 ? GRASS_DEEP : BLOSSOM);
  }

  // Flower beds and a vegetable plot: rows, again, because rows are what the
  // editor is good at and the point is to make that obvious.
  for (let x = 5; x <= 9; x++) {
    put(x, 1, 8, SLAB, x % 2 === 0 ? BLOSSOM : POLLEN, MATTE);
    put(x, 1, 9, SLAB, x % 2 === 0 ? POLLEN : BLOSSOM, MATTE);
  }
  for (let x = -18; x <= -10; x++) {
    for (let z = -8; z <= -3; z++) {
      // Dirt rows with a planted stripe every third one.
      put(x, 1, z, SLAB, (z + 8) % 3 === 0 ? GRASS_DEEP : DIRT, MATTE);
    }
  }

  // A well, on the corner where the two paths meet.
  for (const [wx, wz] of [
    [3, -3],
    [4, -3],
    [3, -2],
    [4, -2],
  ] as const) {
    put(wx, 1, wz, BLOCK, STONE, MATTE);
  }
  put(3, 2, -3, BLOCK, BEAM, MATTE);
  put(4, 2, -2, BLOCK, BEAM, MATTE);
  put(3, 3, -3, BLOCK, SLATE, MATTE);
  put(4, 3, -2, BLOCK, SLATE, MATTE);

  return [...cells.values()];
}

/** On the path, facing the front door. */
export const COTTAGE_SPAWN: Vec3 = [-0.5, 2.4, -8.5];

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
