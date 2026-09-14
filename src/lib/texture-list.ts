/**
 * The block surface textures, index-addressed.
 *
 * ── Why this is its own file with no imports ─────────────────────────────
 *
 * Three things read this list and they cannot share a module graph:
 *
 *  - `worlddoc.ts`, to bound the eighth tuple field in the zod schema;
 *  - the editor toolbar, to draw a chip per surface;
 *  - `scripts/build-textures.ts`, running under Node, to lay the strip out in
 *    this exact order and refuse to build one that disagrees.
 *
 * Same reason `sky-stops.ts` exists apart from `atmosphere.ts`: a script that
 * wants eleven strings should not have to load zod and three.js to get them.
 *
 * ── The list is append-only ──────────────────────────────────────────────
 *
 * A part stores its surface as an INDEX into this array, in every saved world
 * and every op on the wire, the same way it stores its colour as an index into
 * PALETTE. Reordering or removing an entry silently retextures every world
 * that used the slots after it. Add at the end; never insert; never delete.
 * Retire a surface by leaving its name in place and pointing its raw source at
 * something else.
 *
 * Index 0 is the identity: a flat mid-grey layer that multiplies the palette
 * colour by exactly one, so a part with no eighth field — every part that
 * existed before this list did — renders as it always has.
 *
 * `source` is the Poly Haven asset id `scripts/fetch-textures.ts` downloads
 * (all CC0 1.0), or null for a layer the build generates itself. The slot
 * names and the raw-asset directories are the same string.
 */
export interface TextureSlot {
  /** Short name, also the directory under assets/raw-textures/. */
  name: string;
  /** Label shown on the editor chip. */
  label: string;
  /** Poly Haven asset id, or null when the build generates the layer. */
  source: string | null;
}

export const TEXTURES: readonly TextureSlot[] = [
  { name: "plain", label: "Plain", source: null },
  { name: "grass", label: "Grass", source: "leafy_grass" },
  { name: "dirt", label: "Dirt", source: "brown_mud_dry" },
  { name: "stone", label: "Stone", source: "rock_boulder_dry" },
  { name: "cobble", label: "Cobble", source: "cobblestone_floor_08" },
  { name: "planks", label: "Planks", source: "wood_planks" },
  { name: "bark", label: "Bark", source: "bark_brown_01" },
  { name: "sand", label: "Sand", source: "sand_01" },
  { name: "snow", label: "Snow", source: "snow_01" },
  { name: "metal", label: "Metal", source: "metal_plate" },
  { name: "brick", label: "Brick", source: "red_brick_03" },
];

/** Highest valid texture index for a part. */
export const MAX_TEXTURE = TEXTURES.length - 1;

/** Edge of one tile in the strip, px. The build and the loader both read it. */
export const TEXTURE_TILE = 256;
