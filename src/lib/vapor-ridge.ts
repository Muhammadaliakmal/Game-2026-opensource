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
 * "Vapor Ridge" — Neon Circuit's shape, with the ground taken away from under it.
 *
 * The circuit is deliberately flat (see circuit.ts): it is the world where
 * movement is the whole subject and nothing interrupts it. This is the other
 * half of that idea — the same rounded-rectangle racing line, the same width,
 * the same start line and grid, so the room server counts its laps with the
 * exact code it uses for the circuit — but with three elevation features cut
 * into the straights:
 *
 *  - a hill up and back down on the right straight (the +X side);
 *  - the ridge itself on the back straight: a longer climb to a flat crest,
 *    then a sheer drop off the far edge that launches a bike doing race speed,
 *    with a lower runway to land on;
 *  - a small rise on the left straight, so no straight is dead.
 *
 * ── Why elevation is a per-straight profile, not a function of lap angle ──
 *
 * The lap parameter the server uses is polar angle about the origin, and its
 * iso-lines are not square to the straights — down a straight they lean a few
 * degrees inward (race-assist.ts explains why). Driving elevation off it would
 * tilt every hill slightly across the road and leave a lateral step down one
 * edge. Instead each straight has its own along-axis coordinate `s` in cells,
 * and a hill is a list of `(s, level)` knots. The four corners and the
 * start/finish straight are flat at level 0, so a ramp — which only turns in
 * 90° steps — is never asked to climb a curve.
 *
 * ── Coordinates ────────────────────────────────────────────────────────
 *
 * A "level" is an integer count of cells above the baseline. The surface for a
 * cell at level L is the top of a block at y = L (y = L+1 in world units); a
 * rider on the flat start straight, level 0, rests where a grid slot puts
 * them. Everything below a raised surface is filled solid to y = 0.
 */

const BLOCK: Shape = 0;
const RAMP: Shape = 2;

// Palette indices (see PALETTE in worlddoc.ts). Kept in step with circuit.ts
// so the two race worlds read as the same place at a different time of night.
const ASPHALT = 4;
const ASPHALT_DARK = 5;
const KERB_A = 31;
const KERB_B = 11;
const RAIL = 18;
const RAIL_LIT = 21;
const LINE = 31;
const START = 26;
const PIT = 3;
const PILLAR = 5; // structure under a raised surface: darkest slate, reads as shadow

const MATTE = 0;
const GLOSSY = 1;
const METAL = 2;
const GLOW = 3;

/** Signed distance from a CELL to the centreline, evaluated at its centre. */
function distanceToLine(x: number, z: number): number {
  return trackDistance(x + 0.5, z + 0.5);
}

/**
 * Which of the loop's five flat-or-sloped regions a cell centre is in.
 *
 * The rounded rectangle splits cleanly: a straight is where one axis is inside
 * the box half-extent and the other is past it; a corner is where both are
 * past it. `s` is the distance along the straight in the direction of travel,
 * in cells, zeroed at the loop centreline crossing — so a hill knot list reads
 * the same whichever straight it is bolted to.
 */
type Region =
  | { kind: "flat" }
  | { kind: "straight"; straight: Straight; s: number };

type Straight = "right" | "back" | "left";

function regionOf(x: number, z: number): Region {
  const cx = x + 0.5;
  const cz = z + 0.5;
  const inX = Math.abs(cx) <= BX;
  const inZ = Math.abs(cz) <= BZ;

  if (inX && cz >= BZ) return { kind: "flat" }; // +Z straight — start/finish
  if (inX && cz <= -BZ) return { kind: "straight", straight: "back", s: -cx };
  if (inZ && cx >= BX) return { kind: "straight", straight: "right", s: -cz };
  if (inZ && cx <= -BX) return { kind: "straight", straight: "left", s: cz };
  return { kind: "flat" }; // corners, infield, anything off the four straights
}

/**
 * Elevation knots per straight, as `(s, level)` read left to right, `s` in
 * cells along the direction of travel.
 *
 * Between two knots the level is linear in `s`; a run of these at one level per
 * cell rounds to a continuous 45° ramp. A pair at least two levels apart and
 * within `CLIFF_CELLS` of each other is instead a cliff — `levelAlong` snaps
 * across it so no cell sits on the face.
 */
const HILLS: Record<Straight, readonly (readonly [number, number])[]> = {
  // Right straight, rides −Z: up four, a crest, back down. z runs 38 → −38, so
  // s = −z runs −38 → 38.
  right: [
    [-40, 0],
    [-15, 0],
    [-11, 4],
    [-1, 4],
    [3, 0],
    [40, 0],
  ],
  // Back straight, rides −X: the ridge. A six-cell climb, a crest, then the
  // drop — six levels inside one cell — onto a runway a cell above the
  // baseline, which eases down to 0 before the corner. s = −x runs −60 → 60.
  back: [
    [-62, 0],
    [-30, 0],
    [-24, 6],
    [-16, 6],
    [-15, 1],
    [18, 1],
    [20, 0],
    [62, 0],
  ],
  // Left straight, rides +Z: a low rise so the run to the line is not dead
  // flat. s = z runs −38 → 38.
  left: [
    [-40, 0],
    [-6, 0],
    [-4, 2],
    [4, 2],
    [6, 0],
    [40, 0],
  ],
};

/**
 * A knot pair one cell apart (or less) and two or more levels apart is a
 * cliff, not a slope — `levelAlong` snaps across it. Only the drop off the
 * ridge crest is written that steep; every other slope spans several cells.
 */
const CLIFF_CELLS = 1;

/** Continuous (pre-rounding) level along a straight at along-axis position `s`. */
function heightAlong(hill: readonly (readonly [number, number])[], s: number): number {
  for (let i = 1; i < hill.length; i++) {
    const [s0, l0] = hill[i - 1];
    const [s1, l1] = hill[i];
    if (s > s1) continue;
    if (Math.abs(l1 - l0) >= 2 && s1 - s0 <= CLIFF_CELLS) {
      return s < (s0 + s1) / 2 ? l0 : l1;
    }
    const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
    return l0 + (l1 - l0) * t;
  }
  return 0;
}

function levelAlong(hill: readonly (readonly [number, number])[], s: number): number {
  return Math.max(0, Math.round(heightAlong(hill, s)));
}

/** The integer road level for the cell at grid coordinates (x, z). */
export function ridgeLevelAt(x: number, z: number): number {
  const r = regionOf(x, z);
  return r.kind === "flat" ? 0 : levelAlong(HILLS[r.straight], r.s);
}

/** Highest level any cell on the track reaches — the crest. */
export const RIDGE_MAX_LEVEL = Math.max(
  ...Object.values(HILLS).flatMap((h) => h.map(([, l]) => l))
);

/**
 * The ramp `rot` whose high edge faces the way a rider gains height on this
 * straight. A ramp's high edge is at +X unrotated; rot turns it 90° per step,
 * so rot 0 → +X, 1 → −Z, 2 → −X, 3 → +Z.
 */
const RAMP_ROT: Record<Straight, { up: number; down: number }> = {
  right: { up: 1, down: 3 }, // rides −Z
  back: { up: 2, down: 0 }, //  rides −X
  left: { up: 3, down: 1 }, //  rides +Z
};

export function vaporRidgeParts(): PartTuple[] {
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

  /**
   * Solid structure from the baseline up to (not including) the surface, so a
   * raised section has an underside rather than floating ramps. Carried to
   * y = 0: a full column gives the greedy mesher a tall run to merge, where a
   * shallow cap leaves the same little boxes for less structure.
   */
  const fillTo = (x: number, level: number, z: number) => {
    for (let y = 0; y < level; y++) put(x, y, z, BLOCK, PILLAR, MATTE);
  };

  const reach = Math.ceil(BX + CORNER + HALF_WIDTH + RAIL_BAND + 2);
  const reachZ = Math.ceil(BZ + CORNER + HALF_WIDTH + RAIL_BAND + 2);

  for (let x = -reach; x <= reach; x++) {
    for (let z = -reachZ; z <= reachZ; z++) {
      const d = distanceToLine(x, z);
      const a = Math.abs(d);
      if (a > HALF_WIDTH + RAIL_BAND) continue;

      const region = regionOf(x, z);
      const level =
        region.kind === "flat"
          ? 0
          : levelAlong(HILLS[region.straight], region.s);

      // How the surface is changing, one cell back along the direction of
      // travel. A rising cell carries a ramp spanning [level, level+1]; a
      // falling one carries a ramp spanning [level+1, level+2] so its high
      // edge meets the higher ground behind it rather than leaving a step.
      // Flat cells — and both lips of the cliff, where |rise| >= 2 — sit at
      // `level`. The kerb takes the same surface, so it stays flush.
      let rise = 0;
      let rot = 0;
      if (region.kind === "straight") {
        const prev = levelAlong(HILLS[region.straight], region.s - 1);
        rise = level - prev;
        const rr = RAMP_ROT[region.straight];
        rot = rise > 0 ? rr.up : rr.down;
      }
      const ramp = Math.abs(rise) === 1;
      const surface = rise === -1 ? level + 1 : level;

      if (a <= HALF_WIDTH) {
        if (ramp) {
          fillTo(x, surface, z);
          put(x, surface, z, RAMP, ASPHALT_DARK, MATTE, rot);
          continue;
        }
        // Flat block: two-tone checker so speed reads, dashed centre line
        // painted in rather than stacked proud of the surface.
        const shade = (Math.floor((x + 64) / 4) + Math.floor((z + 64) / 4)) % 2;
        const dash = a < 0.55 && Math.floor((x + z + 128) / 2) % 3 === 0;
        fillTo(x, surface, z);
        put(
          x,
          surface,
          z,
          BLOCK,
          dash ? LINE : shade ? ASPHALT : ASPHALT_DARK,
          MATTE
        );
        continue;
      }

      // Kerb, then a two-high rail on top of it. The kerb follows the surface
      // level but never ramps — it is not driven on, and hull colliders down
      // both sides of every slope is a cost with no rider on the other end.
      const stripe = Math.floor((x + z + 128) / 2) % 2 === 0;
      fillTo(x, surface, z);
      put(x, surface, z, BLOCK, stripe ? KERB_A : KERB_B, GLOSSY);
      put(x, surface + 1, z, BLOCK, RAIL, METAL);
      put(x, surface + 2, z, BLOCK, d > 0 ? RAIL : RAIL_LIT, d > 0 ? METAL : GLOW);
    }
  }

  // ── Start / finish ──────────────────────────────────────────────────────
  // Identical to Neon Circuit: the +Z straight is flat at level 0, so every Y
  // here is the circuit's Y unchanged.
  const lineZ = Math.round(START_LINE_Z);
  const edge = Math.ceil(HALF_WIDTH + RAIL_BAND) + 1;

  for (let z = lineZ - edge; z <= lineZ + edge; z++) {
    for (const x of [-1, 0]) {
      if (Math.abs(distanceToLine(x, z)) > HALF_WIDTH) continue;
      const chequer = (x + z) % 2 === 0;
      put(x, 0, z, BLOCK, chequer ? LINE : ASPHALT_DARK, MATTE);
    }
  }

  const postA = lineZ - edge;
  const postB = lineZ + edge;
  for (let y = 3; y <= 6; y++) {
    put(0, y, postA, BLOCK, PIT, METAL);
    put(0, y, postB, BLOCK, PIT, METAL);
  }
  for (let z = postA; z <= postB; z++) put(0, 7, z, BLOCK, PIT, METAL);
  for (const z of [lineZ - edge + 1, lineZ, lineZ + edge - 1]) {
    put(0, 6, z, BLOCK, START, GLOW);
  }

  return [...cells.values()];
}

/**
 * Just behind the start line, on the racing surface — the pre-grid mount and
 * the fallback if the server's grid message is slow. The start straight is
 * level 0, so this is Neon Circuit's spawn value for value.
 */
export const RIDGE_SPAWN: Vec3 = [-2.5, 1.4, START_LINE_Z];

export function vaporRidgeWorldDoc(
  id: string,
  ownerId: string,
  name = "Vapor Ridge"
): WorldDoc {
  return {
    v: 1,
    id,
    name,
    ownerId,
    spawn: RIDGE_SPAWN,
    sky: 0,
    parts: vaporRidgeParts(),
    props: [],
  };
}
