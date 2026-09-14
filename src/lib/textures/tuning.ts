/**
 * Every number the block texturing reads, in one place.
 *
 * The texture spec's Part 0 asks for exactly this — one file, so a tuning
 * pass is a diff of one file and nobody hunts a magic constant through three
 * shader strings. The build-time numbers (tile size, contrast) are in
 * `texture-list.ts` and `scripts/build-textures.ts`; these are the runtime
 * ones.
 */

/**
 * How many texture tiles span one world unit.
 *
 * 1.0 gives every face of a unit cube exactly one tile, which is what a
 * per-face UV would have given — and because the projection is by world
 * position rather than per block, a floor of the same surface tiles
 * continuously across cells instead of visibly restarting at every edge.
 */
export const TEXTURE_SCALE = 1.0;

/**
 * Sharpness of the triplanar blend, as the exponent on |normal|.
 *
 * Block faces are axis-aligned, so on 99% of every surface one weight is 1
 * and the others 0 whatever this is. It only shapes the few pixels across a
 * chamfer, where 8 blends the two adjoining faces without a visible line.
 */
export const TRIPLANAR_SHARPNESS = 8.0;

/**
 * Strength of the normal map, as a multiplier on the tangent-space slope.
 *
 * 1.0 is the map as authored. Photographic normals from a 1K source read
 * slightly strong once shrunk to 256px — the fine relief survives, the gentle
 * undulation is averaged away — so this is pulled back a touch.
 */
export const NORMAL_STRENGTH = 0.85;

/**
 * Part 8 — the close-up detail pass.
 *
 * One 256² grey noise texture, tiled far more finely than the surface, so a
 * block at arm's length still has grain in it. Faded out with distance so it
 * cannot shimmer at range: past `fadeEnd` it contributes nothing.
 */
export const DETAIL = {
  /** Tiles per world unit. */
  scale: 24.0,
  /** 0 = off, 1 = heavy grain. The spec's sweet spot is 0.3–0.4. */
  strength: 0.3,
  /** Metres. Full strength inside this. */
  fadeStart: 8,
  /** Metres. Zero past this. */
  fadeEnd: 20,
} as const;
