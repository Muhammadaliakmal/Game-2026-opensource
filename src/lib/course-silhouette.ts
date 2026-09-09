import { getBuiltInWorld } from "./built-in-worlds";

/**
 * A course's own shape, as a small array of heights.
 *
 * ── The bug this exists for ──────────────────────────────────────────────
 *
 * `CourseCard` drew a skyline from `PROFILE[tier]` — a climb rate, a bar width
 * and a gap, per tier. Twenty courses across five tiers therefore had five
 * pictures between them, and the `seed` prop that looked like it varied them
 * only fed an SVG gradient id. Vault of Wires and Zip Line are both Hard, so
 * they had byte-identical art and identical tier captions; nothing on either
 * card distinguished it from the other except the name.
 *
 * A thumbnail that is the same for every course in a tier is worse than no
 * thumbnail, because it looks like information and is not.
 *
 * ── Why a height profile and not a top-down map ──────────────────────────
 *
 * A top-down silhouette of the block placement is the obvious answer and it is
 * the wrong one at this size. A card's art is 220x90; a course is up to ninety
 * cells long and a few wide, so a plan view is a thin smear across the top of
 * the box with most of the picture empty. The useful, legible fact about a
 * parkour course at thumbnail size is its ELEVATION — where it climbs, where
 * it gives height back, how broken the run is — which is what a player is
 * actually choosing between and what the tier caption only summarises.
 *
 * So this projects the parts onto the course's long axis and takes the tallest
 * block in each column. Gaps in the run stay gaps, because a column with no
 * blocks in it reports zero.
 *
 * ── Why it is cached at module scope ─────────────────────────────────────
 *
 * `build()` generates a full WorldDoc — thousands of part tuples — and the
 * parkour page renders twenty cards on a `force-dynamic` route, so doing this
 * per request would build twenty courses on every page view to draw forty
 * kilobytes of SVG.
 *
 * The cache is permanently valid, which is the part worth stating: these
 * courses are generated from code, deterministically, at module load. There is
 * no input that could change one between two requests to the same server
 * process. A built-in course is a constant that happens to be computed.
 */

/** How many columns a silhouette has. Enough to read, few enough to draw. */
export const SILHOUETTE_COLUMNS = 22;

/** Heights in 0..1, left to right along the course's long axis. */
export type Silhouette = number[];

const cache = new Map<string, Silhouette>();

/**
 * The owner id handed to `build()`.
 *
 * It ends up in `doc.ownerId` and nothing here reads it. Named rather than
 * passed as `""` so it is obvious at the call site that no real user is
 * involved — this is geometry, not a world anybody owns.
 */
const NOBODY = "silhouette";

export function silhouetteFor(slug: string): Silhouette | null {
  const hit = cache.get(slug);
  if (hit) return hit;

  const world = getBuiltInWorld(slug);
  if (!world) return null;

  const doc = world.build(NOBODY);
  const parts = doc.parts;
  if (parts.length === 0) return null;

  // ── Which way is "along" ──────────────────────────────────────────────
  //
  // Courses are authored on both axes — Beacon Climb switchbacks east on x,
  // others run on z — so the long axis is measured rather than assumed. Using
  // x unconditionally would squash a z-running course into one column and
  // report a single bar, which is a picture of nothing.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of parts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[2] < minZ) minZ = p[2];
    if (p[2] > maxZ) maxZ = p[2];
  }

  const alongX = maxX - minX >= maxZ - minZ;
  const lo = alongX ? minX : minZ;
  const span = Math.max(1, (alongX ? maxX - minX : maxZ - minZ) + 1);

  // ── The heightmap ─────────────────────────────────────────────────────
  const columns = new Array<number>(SILHOUETTE_COLUMNS).fill(0);
  let peak = 0;
  for (const p of parts) {
    const at = alongX ? p[0] : p[2];
    // `min(…, COLUMNS - 1)` because the part at the far end lands exactly on
    // the boundary and would otherwise index one past the array.
    const col = Math.min(
      SILHOUETTE_COLUMNS - 1,
      Math.floor(((at - lo) / span) * SILHOUETTE_COLUMNS)
    );
    // The top of the block, not its origin: a part is min-corner (see
    // courses.ts), so a pad at y=4 has its surface at 5, and that is the
    // height a runner stands at.
    const top = p[1] + 1;
    if (top > columns[col]) columns[col] = top;
    if (top > peak) peak = top;
  }

  // Normalised, so a nine-cell tutorial and a forty-cell expert both fill the
  // card. The picture is about the SHAPE of the climb, not about how tall the
  // course is in absolute terms — that is what the tier caption says.
  const scale = peak > 0 ? 1 / peak : 0;
  const out = columns.map((h) => h * scale);

  cache.set(slug, out);
  return out;
}
