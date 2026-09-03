import type { PartTuple, Shape, Vec3, WorldDoc } from "./worlddoc";
import {
  BX,
  BZ,
  CORNER,
  HALF_WIDTH,
  RAIL_BAND,
  START_LINE_Z,
  trackDistance,
} from "./race-track";

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

/**
 * The shape of the loop lives in race-track.ts.
 *
 * It was inlined here until the track had to be raced on: the room server
 * counts laps and has to agree with this geometry exactly, and two copies of a
 * distance field is two copies that can drift. See race-track.ts for the
 * numbers and for why the loop is the size it is.
 */

/** Signed distance from a CELL to the centreline, evaluated at its centre. */
function distanceToLine(x: number, z: number): number {
  return trackDistance(x + 0.5, z + 0.5);
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

        // Dashed centre line, painted INTO the road rather than stacked on
        // top of it. A slab at y = 1 stands half a cell proud of the surface,
        // which put a line of bumps straight down the racing line — you felt
        // them at speed — and cost one collider apiece because a slab is not
        // a full cube and never merges.
        const dash = a < 0.55 && Math.floor((x + z + 128) / 2) % 3 === 0;
        put(x, 0, z, BLOCK, dash ? LINE : shade ? ASPHALT : ASPHALT_DARK, MATTE);
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
  /*
    Across the track, not along it.
    
    At x = 0 the loop's straight runs parallel to X and its WIDTH is in Z, so a
    line spanning x = -3..3 (as this did) was a patch lying lengthwise down the
    middle of the road. A start line has to be something you cross, which means
    two cells deep in the direction of travel and as wide as the track is.
    
    The extent is measured off the same distance field the surface is stamped
    from rather than hardcoded, so it stays exactly track-width if the loop is
    ever resized again.
  */
  const lineZ = Math.round(START_LINE_Z);
  const edge = Math.ceil(HALF_WIDTH + RAIL_BAND) + 1;

  for (let z = lineZ - edge; z <= lineZ + edge; z++) {
    for (const x of [-1, 0]) {
      if (Math.abs(distanceToLine(x, z)) > HALF_WIDTH) continue;
      // Painted into the surface for the same reason the centre line is: a
      // chequered ridge across the road is not what a start line is.
      const chequer = (x + z) % 2 === 0;
      put(x, 0, z, BLOCK, chequer ? LINE : ASPHALT_DARK, MATTE);
    }
  }

  // A gantry over the line, so the start reads from a distance. Its posts stand
  // just outside the rail on either side, which is also across the track.
  const postA = lineZ - edge;
  const postB = lineZ + edge;
  for (let y = 3; y <= 6; y++) {
    put(0, y, postA, BLOCK, PIT, METAL);
    put(0, y, postB, BLOCK, PIT, METAL);
  }
  for (let z = postA; z <= postB; z++) put(0, 7, z, BLOCK, PIT, METAL);
  // Start lights, spaced across the beam. Measured off `edge` like the posts
  // are, so they spread with the gantry instead of huddling in the middle of
  // the road the moment the track gets wider.
  for (const z of [lineZ - edge + 1, lineZ, lineZ + edge - 1]) {
    put(0, 6, z, BLOCK, START, GLOW);
  }

  return [...cells.values()];
}

/**
 * Just behind the start line, on the racing surface.
 *
 * Y matches a grid slot's: the road top is y = 1 and the bike rests a wheel
 * radius above that. This is only the pre-grid mount point and the fallback if
 * the server's grid message is slow — but a 1.4-unit drop here flipped the bike
 * before the grid pose ever arrived.
 */
export const CIRCUIT_SPAWN: Vec3 = [-2.5, 1.4, START_LINE_Z];

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
