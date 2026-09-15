import { PALETTE, type PartTuple } from "./worlddoc";
import { occlusionIndex, partsByCell } from "./occlusion";

/**
 * A bird's-eye picture of a world, drawn from the world's own blocks.
 *
 * ── The angle is a comprehension decision, not an aesthetic one ──────────
 *
 * Straight down is the obvious reading of "bird's-eye" and it is the wrong
 * one here. A parkour course's whole identity is height — the climb, the gap,
 * the drop — and a 90° camera collapses every platform onto the same plane,
 * so the card shows a maze rather than a course. A race track loses its
 * elevation the same way: Vapor Ridge's crest reads as a flat oval.
 *
 * So: a fixed oblique elevation, the convention isometric strategy games use.
 * High enough to read as "from above", shallow enough that a block stack is
 * still a stack.
 *
 * **Orthographic, not perspective.** These sit in a grid next to each other,
 * and the point of the grid is that a player can compare levels. Perspective
 * shrinks whatever is further from the lens, so a big world and a small one
 * stop being comparable — a small level near the camera can out-measure a
 * large one. Orthographic keeps a unit block the same size everywhere, in
 * every card.
 *
 * **One heading for every world, never auto-fitted per world.** Choosing the
 * flattering angle per level is tempting and it is what makes a level-select
 * screen look cheap: every card ends up lit from a different direction. One
 * heading is what makes them read as a matched set.
 *
 * ── Why this is generated, not screenshotted ─────────────────────────────
 *
 * CLAUDE.md rules out screenshots for the mode covers, and the reason applies
 * here with more force: a captured image is wrong the moment a generator
 * changes, and it is wrong silently. These are drawn from `WorldDoc.parts` —
 * the same array the game builds the world from — so a cover cannot show a
 * world that does not exist. `world-cover.test.ts` hashes the parts and holds
 * the committed manifest to them, so a world edited without re-running the
 * script fails the suite rather than the player.
 *
 * ── Output is SVG ────────────────────────────────────────────────────────
 *
 * Not a pixel buffer. The whole picture is flat-shaded axis-aligned quads,
 * which is exactly what SVG is good at, and it means this module needs no
 * rasteriser, no canvas and no GPU — it runs in a plain Node script, and in
 * a test. `scripts/generate-covers.ts` hands the string to sharp, which is
 * already a dependency and already renders the icon set.
 */

/**
 * The rig. Fixed for every world in every mode, forever.
 *
 * Changing any of these invalidates every committed cover at once, which is
 * the point: they are a contract about what a card looks like, not a per-
 * world tuning knob.
 */
export const COVER_RIG = {
  /** Degrees above the horizon. Shallow enough that a stack reads as a stack. */
  elevationDeg: 37,
  /** Compass heading, degrees. The camera sits south-west of every world. */
  headingDeg: 225,
  /** Breathing room around the world's extent, as a multiplier. */
  padding: 1.1,
  /** Card image ratio. */
  aspect: 16 / 10,
} as const;

/** Output pixel size. The PNG the script writes; the SVG is unitless. */
export const COVER_W = 640;
export const COVER_H = Math.round(COVER_W / COVER_RIG.aspect);

/**
 * How much light each face gets.
 *
 * A fixed three-value ramp rather than a real light: the faces are axis-
 * aligned and there are exactly three visible, so a dot product would produce
 * three constants and cost an explanation. Top brightest, then the two sides
 * separated enough that a corner reads as a corner.
 */
const FACE_SHADE = { top: 1, south: 0.74, west: 0.55 } as const;

const RAD = Math.PI / 180;

/** The camera's own axes, in world space. Derived once from the rig. */
function basis() {
  const e = COVER_RIG.elevationDeg * RAD;
  const h = COVER_RIG.headingDeg * RAD;
  // Direction from the world's centre toward the camera.
  const dir = {
    x: Math.cos(e) * Math.sin(h),
    y: Math.sin(e),
    z: Math.cos(e) * Math.cos(h),
  };
  // Screen right: perpendicular to the view direction, level with the ground.
  const rl = Math.hypot(dir.z, -dir.x) || 1;
  const right = { x: dir.z / rl, y: 0, z: -dir.x / rl };
  // Screen up: completes the frame, and the order of this cross product is
  // the whole picture's orientation. `dir` points from the world toward the
  // camera, so it is the camera's +Z; with `right` as +X, a right-handed
  // frame makes up = dir × right. The other order, right × dir, is its
  // negative — it still points out of the ground plane, which is what makes
  // it survive a glance, and it draws every world upside down.
  const up = {
    x: dir.y * right.z - dir.z * right.y,
    y: dir.z * right.x - dir.x * right.z,
    z: dir.x * right.y - dir.y * right.x,
  };
  return { dir, right, up };
}

const B = basis();

/** World point → screen (u, v) and a depth, all orthographic. */
function project(x: number, y: number, z: number) {
  return {
    u: x * B.right.x + y * B.right.y + z * B.right.z,
    v: x * B.up.x + y * B.up.y + z * B.up.z,
    d: x * B.dir.x + y * B.dir.y + z * B.dir.z,
  };
}

/** Multiply a hex colour by a scalar, staying in 0..255. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A face, ready to sort and emit. */
interface Face {
  d: number;
  fill: string;
  pts: string;
}

/**
 * `[x, y, z, shape, colour, finish, rot, texture?]` — see `worlddoc.ts`.
 *
 * Shape 1 is a slab and is drawn at half height, because a slab floor next to
 * a block floor is a step and the picture should show it. Shapes 2 and 3 (the
 * ramp and the wedge) are drawn as full blocks: they are cut on a diagonal,
 * and at the size a card is actually looked at the cut is under a pixel. That
 * is a deliberate simplification and the only one in here.
 */
function heightOf(shape: number): number {
  return shape === 1 ? 0.5 : 1;
}

export interface CoverOptions {
  width?: number;
  height?: number;
  /** Drawn behind the world. Omit for a transparent cover. */
  background?: string;
}

/**
 * Draw the world.
 *
 * Returns an SVG document as a string. Deterministic: the same parts always
 * produce byte-identical output, which is what lets the freshness test be a
 * hash comparison rather than an image diff.
 */
export function coverSvg(parts: PartTuple[], opts: CoverOptions = {}): string {
  const width = opts.width ?? COVER_W;
  const height = opts.height ?? COVER_H;

  if (parts.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Blocks sealed in on all six sides cannot appear in the picture. Worth
  // doing here for the same reason the renderer does it — Island is 45%
  // interior — except here it also shrinks the file rather than the frame
  // time.
  const occ = occlusionIndex(partsByCell(parts));

  const faces: Face[] = [];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  const quad = (
    d: number,
    fill: string,
    corners: Array<[number, number, number]>
  ) => {
    let pts = "";
    for (const [x, y, z] of corners) {
      const p = project(x, y, z);
      if (p.u < minU) minU = p.u;
      if (p.u > maxU) maxU = p.u;
      if (p.v < minV) minV = p.v;
      if (p.v > maxV) maxV = p.v;
      pts += `${p.u},${p.v} `;
    }
    faces.push({ d, fill, pts: pts.trimEnd() });
  };

  for (const p of parts) {
    const [x, y, z, shape, colour] = p;
    if (occ.hidden(x, y, z)) continue;

    const t = heightOf(shape);
    const base = PALETTE[colour] ?? PALETTE[0];
    // Depth of the block's centre. Orthographic, so one number per block
    // orders every one of its faces correctly against every other block's.
    const c = project(x + 0.5, y + t / 2, z + 0.5);

    // Only three faces can ever be seen from this rig: the top, and the two
    // sides pointing at the camera. The camera sits at -X and -Z of centre
    // (heading 225°), so those are the -X face and the -Z face. Drawing the
    // other three would be three quads per block, hidden behind these.
    quad(c.d, shade(base, FACE_SHADE.top), [
      [x, y + t, z],
      [x + 1, y + t, z],
      [x + 1, y + t, z + 1],
      [x, y + t, z + 1],
    ]);
    quad(c.d, shade(base, FACE_SHADE.south), [
      [x, y, z],
      [x + 1, y, z],
      [x + 1, y + t, z],
      [x, y + t, z],
    ]);
    quad(c.d, shade(base, FACE_SHADE.west), [
      [x, y, z],
      [x, y, z + 1],
      [x, y + t, z + 1],
      [x, y + t, z],
    ]);
  }

  if (faces.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Painter's algorithm. Far first, so near blocks paint over them — which is
  // correct here and would not be for a perspective camera, because an
  // orthographic view has one depth axis shared by every block.
  faces.sort((a, b) => a.d - b.d);

  // Fit the world to the card. One scale for both axes, so nothing is
  // stretched, and the same padding ratio for every world — which is what
  // makes a small world look small rather than blown up to fill its card.
  const spanU = Math.max(maxU - minU, 1e-6);
  const spanV = Math.max(maxV - minV, 1e-6);
  const scale = Math.min(width / (spanU * COVER_RIG.padding), height / (spanV * COVER_RIG.padding));
  const offU = width / 2 - ((minU + maxU) / 2) * scale;
  // SVG's Y axis runs down the screen and the projection's V runs up it, so
  // the sign flips here rather than in `project` — the projection stays in
  // ordinary maths coordinates and only the emitter knows about SVG.
  const offV = height / 2 + ((minV + maxV) / 2) * scale;

  const body = faces
    .map((f) => {
      const pts = f.pts
        .split(" ")
        .map((pair) => {
          const [u, v] = pair.split(",");
          const sx = Number(u) * scale + offU;
          const sy = offV - Number(v) * scale;
          return `${sx.toFixed(1)},${sy.toFixed(1)}`;
        })
        .join(" ");
      return `<polygon points="${pts}" fill="${f.fill}"/>`;
    })
    .join("");

  const bg = opts.background
    ? `<rect width="${width}" height="${height}" fill="${opts.background}"/>`
    : "";

  // `shape-rendering="crispEdges"` on purpose: the faces are butted against
  // each other, and an antialiased edge between two quads that share a border
  // leaves a lighter seam along every block. This is a picture of a grid.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${bg}${body}</svg>`
  );
}

/**
 * A fingerprint of what a cover was drawn from.
 *
 * Only the fields the picture depends on — position, shape and colour. A
 * finish or a texture change cannot alter a flat-shaded quad, so it must not
 * mark every cover stale; the same argument `courseKey` makes in
 * `course-floor.ts` about which fields can move a route floor.
 */
export function coverKey(parts: PartTuple[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const p of parts) {
    const vals = [p[0], p[1], p[2], p[3], p[4]];
    for (const v of vals) {
      h1 = Math.imul(h1 ^ (v + 0x9e37), 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (v + 0x85eb), 0x85ebca6b) >>> 0;
    }
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0"));
}
