import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/**
 * The icon set, checked against the artwork it is derived from.
 *
 * Icons are the one asset nobody looks at after the day they are made, and
 * the one asset a user sees before anything else. Every failure here is
 * invisible on the machine that built it: a maskable icon whose subject gets
 * shaved off is only wrong on a launcher that crops to a circle, and an
 * apple-touch-icon with an alpha channel is only wrong on iOS, which
 * composites it onto white.
 */

const ICONS = path.join(process.cwd(), "public", "icons");
const MASTER = path.join(process.cwd(), "assets", "icon-master.png");

/** Everything `scripts/generate-icons.ts` writes, and the size it claims. */
const EXPECTED = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

test("the master artwork is present and square", async () => {
  // Without it the generator cannot run at all, and a deploy builds from git.
  assert.ok(existsSync(MASTER), "assets/icon-master.png is missing");
  const m = await sharp(MASTER).metadata();
  assert.equal(m.width, m.height, "the master is not square");
  assert.ok((m.width ?? 0) >= 512, `the master is only ${m.width}px`);
});

test("every icon the manifest and the layout reference exists, at its stated size", async () => {
  for (const { file, size } of EXPECTED) {
    const p = path.join(ICONS, file);
    assert.ok(existsSync(p), `${file} is missing — run npm run icons:generate`);
    const m = await sharp(p).metadata();
    assert.equal(m.width, size, `${file} is ${m.width}px, manifest says ${size}`);
    assert.equal(m.height, size, `${file} is not square`);
  }
  assert.ok(
    existsSync(path.join(process.cwd(), "public", "favicon.png")),
    "favicon.png is missing"
  );
});

test("the apple touch icon is opaque", async () => {
  // iOS composites it onto white rather than honouring alpha, so a
  // transparent corner arrives as a white corner on somebody's home screen.
  const { data, info } = await sharp(path.join(ICONS, "apple-touch-icon.png"))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let min = 255;
  for (let i = 3; i < data.length; i += info.channels) min = Math.min(min, data[i]);
  assert.equal(min, 255, "the apple touch icon has transparent pixels");
});

/**
 * How sharp the image gets, inside and outside the maskable safe zone.
 *
 * A launcher may crop a maskable icon to any shape inside the centre 80% — a
 * circle of radius 40% of the edge. `generate-icons.ts` ships the artwork
 * full-bleed on the measured claim that the cube sits inside that circle, so
 * what has to be true is that there is nothing but smooth gradient outside it.
 *
 * "Smooth" is measurable without knowing anything about the picture: a
 * gradient changes by a value or two between neighbouring pixels, and an edge
 * changes by tens. So the largest neighbour-to-neighbour step outside the
 * circle is the number, and no subject detection is needed.
 */
async function contrast(file: string) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const safe = 0.4 * w;

  let outside = 0;
  let inside = 0;
  const at = (x: number, y: number, c: number) => data[(y * w + x) * ch + c];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let step = 0;
      for (let c = 0; c < 3; c++) {
        const v = at(x, y, c);
        step = Math.max(step, Math.abs(v - at(x + 1, y, c)), Math.abs(v - at(x, y + 1, c)));
      }
      const r = Math.hypot(x - cx, y - cy);
      if (r > safe) outside = Math.max(outside, step);
      else inside = Math.max(inside, step);
    }
  }
  return { outside, inside };
}

test("the maskable icon's subject sits inside the safe zone", async () => {
  const { outside, inside } = await contrast(path.join(ICONS, "icon-maskable-512.png"));

  // The test is only meaningful if it could have failed: there has to BE a
  // subject with hard edges somewhere, or a blank image would pass.
  assert.ok(inside > 40, `no hard edges anywhere (max step ${inside}) — is this the artwork?`);

  assert.ok(
    outside < 24,
    `something with a hard edge (step ${outside}) sits outside the 40% safe ` +
      `radius, so a round launcher mask will cut it. Inset the artwork, or ` +
      `composite a padded maskable variant in scripts/generate-icons.ts.`
  );
});
