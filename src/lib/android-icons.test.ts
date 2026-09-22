import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

/**
 * The Capacitor app's launcher icons and splash, checked against the artwork
 * they are derived from.
 *
 * `icons.test.ts` makes this argument for the web set and every word of it
 * applies here: an icon is the one asset nobody looks at after the day it is
 * made and the first thing a player sees. What is different is that none of
 * these can be seen at all without building an APK and installing it, so the
 * feedback loop this stands in for is not "look at the page" — it is a
 * Gradle build, a cable and a phone.
 *
 * Every failure here is invisible on the machine that built it. An adaptive
 * foreground whose subject overruns the safe zone is only wrong on a launcher
 * that crops to a circle; a transparent one is only wrong on Android 12 and
 * up, which draws the system splash from that layer; a splash whose field is
 * not the launch colour is only wrong for the half second before the WebView
 * paints.
 *
 * See `scripts/generate-android-assets.ts` for why the numbers are what they
 * are, and `docs/CAPACITOR.md` for what the app is.
 */

const RES = path.join(process.cwd(), "capacitor-android", "app", "src", "main", "res");

/** The app background: the splash field, and the adaptive icon's other layer. */
const BACKGROUND = [0x1a, 0x1d, 0x21];

const DENSITIES = [
  { dir: "mdpi", scale: 1 },
  { dir: "hdpi", scale: 1.5 },
  { dir: "xhdpi", scale: 2 },
  { dir: "xxhdpi", scale: 3 },
  { dir: "xxxhdpi", scale: 4 },
] as const;

const SPLASH_PORTRAIT: Record<string, [number, number]> = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

const mip = (dir: string, file: string) => path.join(RES, `mipmap-${dir}`, file);

test("every density has a launcher icon, at the size that bucket means", async () => {
  for (const { dir, scale } of DENSITIES) {
    for (const file of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const p = mip(dir, file);
      assert.ok(existsSync(p), `${dir}/${file} is missing — run npm run cap:assets`);
      const m = await sharp(p).metadata();
      // 48dp is the launcher icon, and the bucket is what dp means in pixels.
      assert.equal(m.width, 48 * scale, `${dir}/${file} is ${m.width}px, not ${48 * scale}`);
      assert.equal(m.height, m.width, `${dir}/${file} is not square`);
    }

    const p = mip(dir, "ic_launcher_foreground.png");
    assert.ok(existsSync(p), `${dir} adaptive foreground is missing`);
    const m = await sharp(p).metadata();
    // An adaptive layer is 108dp whatever the icon inside it is.
    assert.equal(m.width, 108 * scale, `${dir} foreground is ${m.width}px, not ${108 * scale}`);
    assert.equal(m.height, m.width, `${dir} foreground is not square`);
  }
});

test("the splash exists both ways up, at the template's sizes", async () => {
  for (const { dir } of DENSITIES) {
    const [pw, ph] = SPLASH_PORTRAIT[dir];
    for (const [w, h, folder] of [
      [pw, ph, `drawable-port-${dir}`],
      [ph, pw, `drawable-land-${dir}`],
    ] as const) {
      const p = path.join(RES, folder, "splash.png");
      assert.ok(existsSync(p), `${folder}/splash.png is missing`);
      const m = await sharp(p).metadata();
      assert.equal(`${m.width}x${m.height}`, `${w}x${h}`, `${folder} is the wrong way up`);
    }
  }
  assert.ok(
    existsSync(path.join(RES, "drawable", "splash.png")),
    "the orientation-less fallback splash is missing"
  );
});

/**
 * How sharp the image gets, inside and outside a radius — the same measure
 * `icons.test.ts` uses, and for the same reason: a gradient changes by a
 * value or two between neighbouring pixels and a subject's edge changes by
 * tens, so the largest neighbour-to-neighbour step is a subject detector that
 * needs to know nothing about the picture.
 */
async function contrast(file: string, safeFraction: number) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const safe = safeFraction * w;

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

test("the adaptive foreground's subject sits inside the 72dp safe zone", async () => {
  // An adaptive layer is 108dp and only the centre 72dp is ever displayed, so
  // the guaranteed circle has radius 36dp — exactly a third of the layer, a
  // tighter budget than the web maskable icon's 40%.
  //
  // What this does NOT decide is the generator's 2/3 mapping. Measured, the
  // cube lands at 60% of the safe radius mapped and 89% full-bleed, so both
  // designs pass this and the choice between them was made on matching the
  // TWA's icon — see the generator's header. The failure this catches is the
  // later one: artwork replaced with a mark that reaches further out than the
  // cube does, which is invisible until a round launcher crops it.
  for (const { dir } of DENSITIES) {
    const { outside, inside } = await contrast(mip(dir, "ic_launcher_foreground.png"), 1 / 3);

    // The test is only meaningful if it could have failed: there has to BE a
    // subject with hard edges, or a blank layer would pass.
    assert.ok(inside > 40, `${dir}: no hard edges anywhere (max step ${inside}) — is this the artwork?`);

    assert.ok(
      outside < 24,
      `${dir}: something with a hard edge (step ${outside}) sits outside the ` +
        `36dp safe radius, so a round launcher mask will cut it. Either the ` +
        `artwork reaches further out than the cube did, or the bleed stopped ` +
        `being a copy of the edge pixels and became a seam.`
    );
  }
});

test("the adaptive foreground is opaque", async () => {
  // Two things read this layer, and a hole is wrong in both. A launcher
  // shifts it for parallax, which would expose the background colour inside
  // the mask; and Android 12 and up draw the system splash icon from it,
  // where a transparent foreground is a blank circle.
  for (const { dir } of DENSITIES) {
    const { data, info } = await sharp(mip(dir, "ic_launcher_foreground.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let min = 255;
    for (let i = 3; i < data.length; i += info.channels) min = Math.min(min, data[i]);
    assert.equal(min, 255, `${dir}: the adaptive foreground has transparent pixels`);
  }
});

test("the round icon is actually round", async () => {
  // Nothing masks `ic_launcher_round` — a launcher asks for it by name
  // precisely because it wants one that is already circular — so if the
  // circle is not in the file, the file is just the square icon again.
  for (const { dir } of DENSITIES) {
    const { data, info } = await sharp(mip(dir, "ic_launcher_round.png"))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width: w, channels: ch } = info;
    const alpha = (x: number, y: number) => data[(y * w + x) * ch + 3];
    assert.equal(alpha(0, 0), 0, `${dir}: the round icon's corner is not transparent`);
    assert.equal(alpha(w >> 1, w >> 1), 255, `${dir}: the round icon's centre is not opaque`);
  }
});

test("the splash field and the icon background are the launch colour", async () => {
  // `capacitor/www/index.html` explains the invariant at length: the splash,
  // the shell, the WebView background and the site are all one colour, so no
  // ordering of events during launch can produce a flash of something else.
  // The template shipped #FFFFFF behind the adaptive icon, which is the kind
  // of white this is all arranged to avoid.
  for (const folder of ["drawable", "drawable-port-xxhdpi", "drawable-land-mdpi"]) {
    const p = path.join(RES, folder, "splash.png");
    const { data } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual(
      [data[0], data[1], data[2]],
      BACKGROUND,
      `${folder}/splash.png does not start on the launch colour`
    );
  }

  const xml = readFileSync(path.join(RES, "values", "ic_launcher_background.xml"), "utf8");
  const hex = /<color name="ic_launcher_background">#([0-9a-fA-F]{6})<\/color>/.exec(xml);
  assert.ok(hex, "ic_launcher_background is not a plain six-digit colour");
  assert.deepEqual(
    [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)),
    BACKGROUND,
    "the adaptive icon's background layer is not the launch colour"
  );

  // The Android 12+ system splash, which is drawn before anything above and
  // cannot read `capacitor.config.ts`. It is a hand-written copy of the same
  // colour for the same reason `content/controls.ts` is a hand-written copy
  // of `DEFAULT_BINDS`, and this is the line that stops the two drifting.
  const styles = readFileSync(path.join(RES, "values", "styles.xml"), "utf8");
  const splash = /<item name="windowSplashScreenBackground">#([0-9a-fA-F]{6})<\/item>/.exec(styles);
  assert.ok(splash, "the launch theme sets no windowSplashScreenBackground");
  assert.deepEqual(
    [0, 2, 4].map((i) => parseInt(splash[1].slice(i, i + 2), 16)),
    BACKGROUND,
    "the Android 12+ system splash is not the launch colour"
  );
});

test("the template's icon is gone", async () => {
  // `npx cap add android` writes the Android Studio template's teal square
  // and green robot. Nothing references these two once the generator has run,
  // and leaving them is how a build ships somebody else's logo.
  for (const dead of [
    path.join(RES, "drawable", "ic_launcher_background.xml"),
    path.join(RES, "drawable-v24", "ic_launcher_foreground.xml"),
  ]) {
    assert.ok(!existsSync(dead), `${path.basename(dead)} is back — did cap add android re-run?`);
  }
});

test("the set was generated from the artwork that is committed now", async () => {
  // The output is committed, so nothing in a build regenerates it and a
  // replaced `icon-master.png` would otherwise ship as the old icon silently.
  // Same shape as `coverKey`: hash the input, not the output, because two
  // machines' libvips need not encode a PNG to identical bytes.
  const stamp = path.join(process.cwd(), "capacitor-android", "icon-master.sha256");
  assert.ok(existsSync(stamp), "icon-master.sha256 is missing — run npm run cap:assets");
  const master = readFileSync(path.join(process.cwd(), "assets", "icon-master.png"));
  assert.equal(
    createHash("sha256").update(master).digest("hex"),
    readFileSync(stamp, "utf8").trim(),
    "the artwork has changed since the icons were generated — run npm run cap:assets"
  );
});

test("the Play listing icon is 512 square and opaque", async () => {
  // Play states the format as 32-bit PNG and composites what it is given onto
  // white before applying its own mask and shadow.
  const p = path.join(process.cwd(), "capacitor-android", "store_icon.png");
  assert.ok(existsSync(p), "store_icon.png is missing — run npm run cap:assets");
  const m = await sharp(p).metadata();
  assert.equal(m.width, 512, `the store icon is ${m.width}px, Play wants 512`);
  assert.equal(m.height, 512, "the store icon is not square");
  assert.equal(m.hasAlpha, true, "the store icon is not 32-bit");

  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  let min = 255;
  for (let i = 3; i < data.length; i += info.channels) min = Math.min(min, data[i]);
  assert.equal(min, 255, "the store icon has transparent pixels");
});

test("the Play feature graphic is 1024×500, 24-bit and under 1 MB", async () => {
  // Play states "JPEG or 24-bit PNG (no alpha)", at most 1 MB.
  const p = path.join(process.cwd(), "capacitor-android", "feature_graphic.png");
  assert.ok(existsSync(p), "feature_graphic.png is missing — run npm run cap:assets");
  const m = await sharp(p).metadata();
  assert.equal(m.width, 1024, `the feature graphic is ${m.width}px wide, Play wants 1024`);
  assert.equal(m.height, 500, `the feature graphic is ${m.height}px tall, Play wants 500`);
  assert.equal(m.hasAlpha, false, "the feature graphic has an alpha channel");
  assert.ok(readFileSync(p).length <= 1024 * 1024, "the feature graphic is over 1 MB");
});
