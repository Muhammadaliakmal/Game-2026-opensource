/**
 * Renders the PWA icon set from the wordmark's own geometry.
 *
 * The mark in the header is a single amber block rotated 45 degrees to read as
 * a voxel corner (see app/layout.tsx). That is the whole brand, so the icons
 * are that shape and nothing else — no gradient, no bevel, no text, which at
 * 48 physical pixels on a launcher would be mud anyway.
 *
 * Two sizes and two shapes, because Android asks for both:
 *
 * - `any` fills the square. Whatever the launcher does with it, the mark stays
 *   inside the frame.
 * - `maskable` is cropped by the launcher into a circle, a squircle, a teardrop
 *   — the OEM decides, and the app does not get a say. Everything that must
 *   survive has to sit inside the centre 80% "safe zone", so the mark is drawn
 *   smaller against a full-bleed background. Ship an `any` icon as maskable and
 *   a round launcher shaves the corners off the diamond.
 *
 * Run: npm run icons:generate
 */

import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");

/** From app/tokens.css — the deepest chrome surface and the one accent. */
const STEEL_900 = "#1a1d21";
const SIGNAL = "#ffb020";

/**
 * @param size    Output edge, px.
 * @param inset   Fraction of the canvas the mark is allowed to occupy. The
 *                maskable variant keeps this well inside the 80% safe zone.
 * @param rounded Whether to round the background corners. Only for `any`:
 *                a maskable icon must be full-bleed or the launcher's own mask
 *                cuts into transparent pixels and leaves a notched square.
 */
function svg(size: number, inset: number, rounded: boolean): Buffer {
  const c = size / 2;
  // The diamond is a square rotated 45°, so its bounding box is the square's
  // diagonal. Divide by √2 to get an edge that still fits within `inset`.
  const edge = (size * inset) / Math.SQRT2;
  const r = rounded ? size * 0.22 : 0;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
       <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${STEEL_900}"/>
       <rect
         x="${c - edge / 2}" y="${c - edge / 2}"
         width="${edge}" height="${edge}"
         fill="${SIGNAL}"
         transform="rotate(45 ${c} ${c})"/>
     </svg>`
  );
}

const TARGETS = [
  { file: "icon-192.png", size: 192, inset: 0.62, rounded: true },
  { file: "icon-512.png", size: 512, inset: 0.62, rounded: true },
  // 0.52 of the full canvas, comfortably inside the 80% circle a round mask
  // leaves behind.
  { file: "icon-maskable-512.png", size: 512, inset: 0.52, rounded: false },
  // Apple ignores the manifest and reads <link rel="apple-touch-icon">. It also
  // composites onto white, so this one cannot be transparent — it isn't.
  { file: "apple-touch-icon.png", size: 180, inset: 0.62, rounded: true },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const { file, size, inset, rounded } of TARGETS) {
    const png = await sharp(svg(size, inset, rounded)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(OUT, file), png);
    console.log(`${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
  }

  // PWABuilder and older Android read this from the document root by
  // convention rather than from the manifest.
  const ico = await sharp(svg(64, 0.62, true)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(process.cwd(), "public", "favicon.png"), ico);
  console.log(`favicon.png  64x64  ${(ico.length / 1024).toFixed(1)} kB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
