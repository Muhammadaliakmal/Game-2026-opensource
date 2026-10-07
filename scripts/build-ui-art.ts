/**
 * Cuts the UI art in `assets/raw-ui/` into small transparent WebPs in
 * `public/ui/`.
 *
 * ── What the raw files are ───────────────────────────────────────────────
 *
 * Generated icons (a coin, hearts, a crown, a flag…) at 3168×1344 or 2048²,
 * each on a flat chroma ground — green for most, magenta for the two that are
 * themselves green — with the generator's watermark in the bottom-right
 * corner. About 3.5 MB apiece. Nothing in that shape can ship: the ground is
 * opaque, the watermark is not ours to show, and a 3 MB heart is a heart that
 * arrives after the game has started.
 *
 * ── What this does to each one ───────────────────────────────────────────
 *
 * 1. **Key.** The ground colour is read off the corners, and every pixel's
 *    alpha comes from how strongly it leans toward that colour — `g − max(r,b)`
 *    for green, `min(r,b) − g` for magenta — rather than from its distance to
 *    it. Distance would keep the soft drop shadow under each icon as a dark
 *    green smudge; dominance sees that shadow as "still green" and drops it.
 * 2. **Despill.** Edge pixels are a blend of icon and ground, so they carry a
 *    green (or pink) fringe. The excess channel is pulled back to the others.
 * 3. **Watermark.** Connected components of what is left; any component that
 *    lies wholly in the bottom-right corner, or is too small to be part of
 *    the art, is erased together with its anti-aliased halo.
 * 4. **Crop and size.** Trimmed to what survives, padded, and fitted to the
 *    size the game actually draws it at (×2 for a dense screen).
 *
 * The raw folder is gitignored, like the other `raw-*` folders; the WebPs it
 * produces are what ships. Re-run after replacing art: `npm run ui:art`.
 */

import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAW = path.join(process.cwd(), "assets", "raw-ui");
const OUT = path.join(process.cwd(), "public", "ui");

/**
 * What ships, and at what size (longest edge, px).
 *
 * Only art something draws is listed. The raw folder also holds buttons,
 * panels, a sword, a leaf, a moon and a grey round button (on a white ground
 * this keyer does not handle) — kept for later, deliberately not exported, so
 * `public/` holds nothing no page asks for.
 */
const EXPORTS: Array<{ name: string; size: number; fillHoles?: boolean }> = [
  { name: "coin", size: 128 },
  { name: "heart-gold", size: 128 },
  { name: "heart-green", size: 128 },
  // The crown's third gem is green, on a green ground, so the keyer eats it.
  // Anything transparent that the outside cannot reach is a hole in the art,
  // not ground — but only here: the gear's centre is a real hole.
  { name: "crown", size: 160, fillHoles: true },
  { name: "flag", size: 128 },
  { name: "lock", size: 128 },
  { name: "fire", size: 128 },
  { name: "gear", size: 128 },
];

type Key = "green" | "magenta";

/** How strongly a pixel leans toward the ground colour: 0 = not at all. */
function lean(key: Key, r: number, g: number, b: number): number {
  return key === "green" ? g - Math.max(r, b) : Math.min(r, b) - g;
}

/** Below LO a pixel is art; above HI it is ground; between, it is an edge. */
const LO = 28;
const HI = 92;

function detectKey(px: Buffer, w: number, h: number): Key {
  let r = 0, g = 0, b = 0, n = 0;
  for (const [cx, cy] of [[4, 4], [w - 5, 4], [4, h - 5]]) {
    const i = (cy * w + cx) * 4;
    r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
  }
  r /= n; g /= n; b /= n;
  if (g > r + 60 && g > b + 60) return "green";
  if (r > g + 60 && b > g + 60) return "magenta";
  throw new Error(`ground is neither green nor magenta (rgb ${r | 0},${g | 0},${b | 0})`);
}

async function cut(name: string, size: number, fillHoles = false) {
  const src = path.join(RAW, `${name}.png`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = data;
  const key = detectKey(px, w, h);
  const original = fillHoles ? Buffer.from(px) : null;

  // 1 + 2: key and despill.
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const s = lean(key, r, g, b);
    const a = s <= LO ? 1 : s >= HI ? 0 : 1 - (s - LO) / (HI - LO);
    if (s > 0) {
      if (key === "green") px[o + 1] = g - s;
      else {
        px[o] = r - s;
        px[o + 2] = b - s;
      }
    }
    px[o + 3] = Math.round(a * 255);
  }

  if (original) restoreEnclosed(px, original, w, h);

  // 3: components over anything visible, so a watermark's halo is part of it.
  const label = new Int32Array(w * h).fill(-1);
  const stack: number[] = [];
  const comps: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || px[start * 4 + 3] < 20) continue;
    const id = comps.length;
    const c = { x0: w, y0: h, x1: 0, y1: 0, n: 0 };
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      c.n++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (label[q] === -1 && px[q * 4 + 3] >= 20) {
            label[q] = id;
            stack.push(q);
          }
        }
      }
    }
    comps.push(c);
  }
  const minArea = w * h * 0.002;
  const keep = comps.map(
    (c) => c.n >= minArea && !(c.x0 > w * 0.72 && c.y0 > h * 0.82)
  );

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    const l = label[p];
    if (l === -1) {
      // Faint pixels below the component threshold: fine inside the art,
      // noise outside it. Cleared here and restored by nothing.
      if (px[p * 4 + 3] < 20) px[p * 4 + 3] = 0;
      continue;
    }
    if (!keep[l]) {
      px[p * 4 + 3] = 0;
      continue;
    }
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < x0) throw new Error("nothing left after keying");

  // 4: crop, pad, fit.
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  const cw = Math.min(w, x1 + pad + 1) - left;
  const ch = Math.min(h, y1 + pad + 1) - top;
  const file = path.join(OUT, `${name}.webp`);
  await sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left, top, width: cw, height: ch })
    .resize(size, size, { fit: "inside" })
    .webp({ quality: 88, alphaQuality: 90, effort: 6 })
    .toFile(file);
  const kb = ((await stat(file)).size / 1024).toFixed(1);
  console.log(`${name.padEnd(12)} ${key.padEnd(7)} ${cw}×${ch} → ${size}px  ${kb} KB`);
}

/** Flood the ground in from the border; whatever it cannot reach is art. */
function restoreEnclosed(px: Buffer, original: Buffer, w: number, h: number) {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!outside[p] && px[p * 4 + 3] < 128) {
      outside[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (y > 0) seed(p - w);
    if (y < h - 1) seed(p + w);
  }
  for (let p = 0; p < w * h; p++) {
    if (outside[p] || px[p * 4 + 3] >= 128) continue;
    const o = p * 4;
    px[o] = original[o];
    px[o + 1] = original[o + 1];
    px[o + 2] = original[o + 2];
    px[o + 3] = 255;
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  for (const { name, size, fillHoles } of EXPORTS) await cut(name, size, fillHoles);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
