/**
 * Build the block surface strips the renderer loads.
 *
 *   node --import tsx scripts/build-textures.ts
 *
 * Reads assets/raw-textures/<slot>/ (from scripts/fetch-textures.ts) and
 * writes public/textures/generated/:
 *
 *   block_surface.jpg   R = tint luminance × AO, G = roughness, one 256² tile
 *                       per TEXTURES entry stacked vertically
 *   block_normal.jpg    GL normal map, same layout
 *   detail_noise.png    256² tileable grey noise for the close-up detail pass
 *   block_manifest.json { tile, layers } — the contract with the loader
 *
 * The tall strip IS the layout a DataArrayTexture wants: layer i is rows
 * [i·tile, (i+1)·tile). The loader slices nothing; it hands the pixels over.
 *
 * ── Tint maps, not colour maps ───────────────────────────────────────────
 *
 * In this game the palette colour a player placed is the content, so a
 * surface must not repaint it. Each albedo is reduced to luminance and
 * normalised so its MEAN is 0.5. The shader multiplies by 2, so on average a
 * textured block is exactly as bright as a plain one and its hue is exactly
 * the palette's — the texture contributes only the variation around that
 * mean. Roughness is normalised the same way, so `matte` stays matte and
 * `glossy` stays glossy with the texture modulating rather than replacing.
 *
 * Layer 0 (`plain`) is written as flat 128 / 128 / (128,128,255): the
 * identity. A part with no surface field samples it and renders exactly as it
 * did before this pipeline existed.
 *
 * ── Why AO is baked here ─────────────────────────────────────────────────
 *
 * three.js reads `aoMap` from the second UV set, and the block geometries
 * have at most one. Multiplying it into the luminance at build time costs
 * nothing at runtime and removes a whole texture from the GPU.
 *
 * ── The release step this does not do ────────────────────────────────────
 *
 * The spec ships KTX2 (Basis UASTC), which stays compressed on the GPU. That
 * needs the KTX-Software toolchain, which is not installed here:
 *
 *   ktx create --format R8G8B8A8_UNORM --encode uastc --zstd 18 \
 *       --layers 11 block_surface_layer_*.png block_surface.ktx2
 *
 * The strips are ~625 KB on the wire and decode to 11 × 256² × 2 maps ≈
 * 5.5 MB of VRAM with mipmaps, well inside the budget in Part 0, so this path
 * ships and KTX2 is the follow-up.
 *
 * ── Why JPEG, and why 4:4:4 ──────────────────────────────────────────────
 *
 * PNG was 2.4 MB, more than three times everything else in public/ put
 * together. JPEG at q90 is a quarter of that with a mean error of ~3.5/255,
 * which a lit, tinted block does not show. The one setting that matters is
 * chroma subsampling: the surface strip keeps luminance in R and roughness in
 * G, and a normal map keeps X and Y in R and G, so 4:2:0 would smear each
 * channel into its neighbour at half resolution. 4:4:4 keeps them apart.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { TEXTURES, TEXTURE_TILE as TILE } from "@/lib/texture-list";

const RAW_DIR = join(process.cwd(), "assets", "raw-textures");
const OUT_DIR = join(process.cwd(), "public", "textures", "generated");

/**
 * How much of the luminance variation survives, 0..1.
 *
 * A photographic albedo tinted by a saturated palette colour reads as dirty
 * when the full contrast is kept — dark cracks in stone become near-black
 * cracks in a bright green block. 0.8 keeps the structure legible and lets the
 * palette colour stay the thing you see.
 */
const LUMA_CONTRAST = 0.8;

/** Same idea for roughness — half-strength modulation around the finish. */
const ROUGH_CONTRAST = 0.5;

const N = TILE * TILE;

/** A greyscale tile as floats 0..1, or a flat tile when the map is absent. */
async function grey(path: string, fallback: number): Promise<Float32Array> {
  const out = new Float32Array(N);
  if (!existsSync(path)) {
    out.fill(fallback);
    return out;
  }
  const buf = await sharp(path)
    .resize(TILE, TILE, { fit: "cover" })
    .greyscale()
    .raw()
    .toBuffer();
  for (let i = 0; i < N; i++) out[i] = buf[i] / 255;
  return out;
}

/** Normalise around a mean of 0.5 with the variation scaled by `contrast`. */
function normalise(v: Float32Array, contrast: number): Float32Array {
  let sum = 0;
  for (let i = 0; i < N; i++) sum += v[i];
  const mean = sum / N || 1;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const relative = (v[i] / mean) * 0.5; // mean lands on 0.5
    out[i] = Math.min(1, Math.max(0, 0.5 + (relative - 0.5) * contrast));
  }
  return out;
}

const to8 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);

async function surfaceTile(dir: string | null): Promise<Buffer> {
  const tile = Buffer.alloc(N * 3);
  if (!dir) {
    for (let i = 0; i < N; i++) {
      tile[i * 3] = 128;
      tile[i * 3 + 1] = 128;
      tile[i * 3 + 2] = 0;
    }
    return tile;
  }
  const [luma, ao, rough] = await Promise.all([
    grey(join(dir, "albedo.jpg"), 0.5),
    grey(join(dir, "ao.jpg"), 1),
    grey(join(dir, "roughness.jpg"), 0.5),
  ]);
  const l = normalise(luma, LUMA_CONTRAST);
  const r = normalise(rough, ROUGH_CONTRAST);
  for (let i = 0; i < N; i++) {
    // AO after normalising, so a cavity darkens rather than shifting the mean.
    tile[i * 3] = to8(l[i] * ao[i]);
    tile[i * 3 + 1] = to8(r[i]);
    tile[i * 3 + 2] = 0;
  }
  return tile;
}

async function normalTile(dir: string | null): Promise<Buffer> {
  const path = dir ? join(dir, "normal.jpg") : null;
  if (!path || !existsSync(path)) {
    const tile = Buffer.alloc(N * 3);
    for (let i = 0; i < N; i++) {
      tile[i * 3] = 128;
      tile[i * 3 + 1] = 128;
      tile[i * 3 + 2] = 255;
    }
    return tile;
  }
  return sharp(path).resize(TILE, TILE, { fit: "cover" }).removeAlpha().raw().toBuffer();
}

/**
 * Tileable value noise: independent random pixels are trivially seamless, and
 * a small box blur that WRAPS keeps them so. Normalised to a mean of 128 so
 * the shader's `× 2` is the identity on average, like the surface strip.
 */
function detailNoise(seed = 0x9e3779b9): Buffer {
  let s = seed >>> 0;
  const rnd = () => {
    // mulberry32 — the same generator the arcade uses, so this is reproducible.
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) raw[i] = rnd();

  const blurred = new Float32Array(N);
  const R = 1;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let sum = 0;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          sum += raw[((y + dy + TILE) % TILE) * TILE + ((x + dx + TILE) % TILE)];
        }
      }
      blurred[y * TILE + x] = sum / ((2 * R + 1) * (2 * R + 1));
    }
  }
  const n = normalise(blurred, 1);
  const tile = Buffer.alloc(N);
  for (let i = 0; i < N; i++) tile[i] = to8(n[i]);
  return tile;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const surface: Buffer[] = [];
  const normal: Buffer[] = [];
  for (const slot of TEXTURES) {
    const dir = slot.source ? join(RAW_DIR, slot.name) : null;
    if (dir && !existsSync(join(dir, "albedo.jpg"))) {
      throw new Error(
        `${slot.name}: no raw maps in ${dir} — run \`npm run textures:fetch\` first`
      );
    }
    surface.push(await surfaceTile(dir));
    normal.push(await normalTile(dir));
    console.log(`  ${slot.name}: ${dir ? "built" : "identity"}`);
  }

  const height = TILE * TEXTURES.length;
  const rawOpts = { raw: { width: TILE, height, channels: 3 as const } };
  const jpeg = { quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true } as const;
  await sharp(Buffer.concat(surface), rawOpts)
    .jpeg(jpeg)
    .toFile(join(OUT_DIR, "block_surface.jpg"));
  await sharp(Buffer.concat(normal), rawOpts)
    .jpeg(jpeg)
    .toFile(join(OUT_DIR, "block_normal.jpg"));
  await sharp(detailNoise(), { raw: { width: TILE, height: TILE, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, "detail_noise.png"));

  // The manifest is the contract with the loader. `layers` is TEXTURES' own
  // order, so the loader can assert the strip it downloaded matches the list
  // the document was written against.
  writeFileSync(
    join(OUT_DIR, "block_manifest.json"),
    JSON.stringify({ tile: TILE, layers: TEXTURES.map((t) => t.name) }, null, 2) + "\n"
  );

  console.log(`Built ${TEXTURES.length} layers at ${TILE}px → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
