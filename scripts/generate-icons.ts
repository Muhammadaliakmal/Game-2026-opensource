/**
 * Renders the PWA icon set from the master artwork.
 *
 * ── What changed, and why the SVG went ───────────────────────────────────
 *
 * This used to draw the icon: an amber square rotated 45° on a steel ground,
 * because at the time that WAS the brand — the wordmark in the header is the
 * same shape, and a flat mark survives being 48 physical pixels on a launcher
 * where a gradient turns to mud.
 *
 * There is real artwork now (`assets/icon-master.png`, 1024²) — an isometric
 * cube, lit from the upper right, over a sunset gradient. So the script's job
 * changes from drawing to deriving: every size comes off that one file, which
 * keeps the rule that made this a script in the first place. The icons are
 * still never hand-edited, because a set edited by hand is a set where the
 * 192 and the 512 drift apart and nobody finds out until an install looks
 * wrong on somebody else's phone.
 *
 * Replace the artwork and re-run: `npm run icons:generate`.
 *
 * ── The maskable one needs no padding, and that is measured ──────────────
 *
 * Android crops a maskable icon to whatever shape the OEM likes, and only the
 * centre 80% — a circle of radius 40% of the edge — is guaranteed to survive.
 * The old mark was drawn smaller for that reason.
 *
 * This artwork does not need it. The cube's silhouette is a hexagon whose
 * extreme points are the top and bottom vertices, about 30% of the edge from
 * the centre, and the left and right vertices at about 26%. Every one of those
 * is inside the 40% radius, so the full-bleed image can be shipped as the
 * maskable variant unchanged — which is better than insetting it, because an
 * inset icon on a launcher that does NOT crop reads as a small picture with a
 * wide margin.
 *
 * If the artwork is ever replaced with something that reaches further out,
 * this is the assumption that breaks, and it breaks silently on somebody
 * else's launcher. `icons.test.ts` measures it rather than trusting it.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");
const MASTER = path.join(process.cwd(), "assets", "icon-master.png");

/**
 * `any` icons fill the square; the maskable one is the same full-bleed image
 * (see the header). Apple ignores the manifest and reads the
 * `apple-touch-icon` link, and it composites onto white — so that one must
 * not be transparent. The master is opaque, so it is not.
 */
const TARGETS = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const master = await readFile(MASTER);

  const meta = await sharp(master).metadata();
  if (meta.width !== meta.height) {
    throw new Error(`the master must be square, got ${meta.width}x${meta.height}`);
  }
  if ((meta.width ?? 0) < 512) {
    throw new Error(`the master is ${meta.width}px; every target is derived from it`);
  }

  for (const { file, size } of TARGETS) {
    const png = await sharp(master)
      // `fit: "cover"` is a no-op on a square master and the right behaviour
      // if one is ever replaced with something slightly off-square: crop
      // rather than letterbox, because a letterboxed launcher icon has bars.
      .resize(size, size, { fit: "cover" })
      // The artwork is a smooth gradient, which is exactly what a palette
      // would band. Full colour, and it is still only a few kB.
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    await writeFile(path.join(OUT, file), png);
    console.log(`${file.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
  }

  // PWABuilder and older Android read this from the document root by
  // convention rather than from the manifest, and it is what the browser tab
  // shows. 64 rather than 32: a tab on a 2x display asks for 32 CSS pixels.
  const ico = await sharp(master)
    .resize(64, 64, { fit: "cover" })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  await writeFile(path.join(process.cwd(), "public", "favicon.png"), ico);
  console.log(`${"favicon.png".padEnd(24)} 64x64  ${(ico.length / 1024).toFixed(1)} kB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
