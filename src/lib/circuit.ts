import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";

/**
 * "Neon Circuit" — a closed loop to run.
 *
 * The course teaches jumping, the island teaches wandering, the cottage
 * teaches building; this one is about pure movement. There is nothing to jump
 * and nothing to fall off — the whole track is flat and railed on both sides,
 * so it is the one world where you can hold sprint and just feel the
 * character move, which is what SPEC §8 says the entire product rests on.
 *
 * The loop is stamped from a rounded-rectangle distance field rather than laid
 * out by hand: it keeps the racing line a constant width all the way round,
 * which a hand-placed oval never quite manages at the corners.
 *
 * Deliberately no elevation change. A ramped section would need every rail and
 * kerb to follow it, and one mismatched rotation there is the difference
 * between a banked corner and an invisible wall.
 */

const BLOCK: Shape = 0;
const SLAB: Shape = 1;

// Palette indices (see PALETTE in worlddoc.ts).
const ASPHALT = 4;
const ASPHALT_DARK = 5;
const KERB_A = 31;
const KERB_B = 11;
const RAIL = 18;
const RAIL_LIT = 21;
const LINE = 31;
const START = 26;
const PIT = 3;

const MATTE = 0;
const GLOSSY = 1;
const METAL = 2;
const GLOW = 3;

// Rounded-rectangle centreline: a box half-extent plus a corner radius.
const BX = 14;
const BZ = 8;
const CORNER = 6;
/** Half the track width. 2.6 gives a five-to-six cell racing line. */
const HALF_WIDTH = 2.6;
const RAIL_BAND = 0.9;

/** Signed distance from a cell centre to the circuit centreline. */
function distanceToLine(x: number, z: number): number {
  const dx = Math.max(Math.abs(x + 0.5) - BX, 0);
  const dz = Math.max(Math.abs(z + 0.5) - BZ, 0);
  return Math.hypot(dx, dz) - CORNER;
}

export function circuitParts(): PartTuple[] {
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

  // Rounded up: the widths are fractional, and a loop bound of 25.5 walks in
  // half-cell steps and emits non-integer coordinates, which the WorldDoc
  // validator rejects outright.
  const reach = Math.ceil(BX + CORNER + HALF_WIDTH + RAIL_BAND + 2);
  const reachZ = Math.ceil(BZ + CORNER + HALF_WIDTH + RAIL_BAND + 2);

  for (let x = -reach; x <= reach; x++) {
    for (let z = -reachZ; z <= reachZ; z++) {
      const d = distanceToLine(x, z);
      const a = Math.abs(d);

      if (a <= HALF_WIDTH) {
        // Racing surface. Two tones in a slow checker so speed is readable —
        // a single flat colour gives the eye nothing to measure motion against.
        const shade = (Math.floor((x + 64) / 4) + Math.floor((z + 64) / 4)) % 2;
        put(x, 0, z, BLOCK, shade ? ASPHALT : ASPHALT_DARK, MATTE);

        // Dashed centre line.
        if (a < 0.55 && (Math.floor((x + z + 128) / 2) % 3 === 0)) {
          put(x, 1, z, SLAB, LINE, MATTE);
        }
        continue;
      }

      if (a <= HALF_WIDTH + RAIL_BAND) {
        // Kerb, then a rail on top of it. The rail is two high so it actually
        // stops you rather than becoming a launch ramp at sprint speed.
        const stripe = (Math.floor((x + z + 128) / 2) % 2) === 0;
        put(x, 0, z, BLOCK, stripe ? KERB_A : KERB_B, GLOSSY);
        put(x, 1, z, BLOCK, RAIL, METAL);
        put(x, 2, z, BLOCK, d > 0 ? RAIL : RAIL_LIT, d > 0 ? METAL : GLOW);
      }
    }
  }

  // ── Start / finish ──────────────────────────────────────────────────────
  // On the bottom straight, where the spawn drops you.
  const lineZ = BZ + CORNER;
  for (let x = -3; x <= 3; x++) {
    for (let i = 0; i < 2; i++) {
      const chequer = (x + i) % 2 === 0;
      put(x, 1, lineZ - 1 + i, SLAB, chequer ? LINE : ASPHALT_DARK, MATTE);
    }
  }

  // A gantry over the line, so the start reads from a distance.
  for (let y = 3; y <= 6; y++) {
    put(-4, y, lineZ, BLOCK, PIT, METAL);
    put(4, y, lineZ, BLOCK, PIT, METAL);
  }
  for (let x = -4; x <= 4; x++) put(x, 7, lineZ, BLOCK, PIT, METAL);
  for (const x of [-2, 0, 2]) put(x, 6, lineZ, BLOCK, START, GLOW);

  return [...cells.values()];
}

/** On the start line, above the track surface. */
export const CIRCUIT_SPAWN: Vec3 = [0.5, 2.4, BZ + CORNER - 0.5];

export function circuitWorldDoc(
  id: string,
  ownerId: string,
  name = "Neon Circuit"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: CIRCUIT_SPAWN,
    sky: 0,
    parts: circuitParts(),
    props: [],
  };
}
