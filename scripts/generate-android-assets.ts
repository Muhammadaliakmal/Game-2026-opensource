/**
 * Renders the Capacitor app's Android launcher icons and splash from the
 * master artwork.
 *
 * `scripts/generate-icons.ts` does this for the web, and this is the same
 * rule applied to the other place an icon is seen: derive every size from
 * `assets/icon-master.png`, never hand-edit one. The TWA needs no equivalent
 * — Bubblewrap reads the web manifest and generates its own buckets from the
 * icons that script already wrote. Capacitor does not; `npx cap add android`
 * writes the Android Studio template's icon and leaves it there, which is how
 * this app came to be building with a teal square and the Android robot on
 * the launcher.
 *
 * Replace the artwork and re-run: `npm run cap:assets`.
 *
 * ── The safe zone is not the web's safe zone ─────────────────────────────
 *
 * A maskable web icon guarantees the centre 80% — a circle of radius 40% of
 * the edge — and `generate-icons.ts` ships the master full-bleed on the
 * measured claim that the cube fits inside it.
 *
 * An adaptive Android icon is a 108dp layer of which only the centre **72dp**
 * is ever displayed; the outer 18dp exists so a launcher can shift the layers
 * for parallax. The mask is applied inside that 72dp, so the guaranteed
 * circle has radius 36dp — a third of the layer, not 40% of it.
 *
 * So the master is not dropped in full-bleed here. It is mapped onto the
 * visible 72dp square, which puts the cube at 59.5% of the mask radius. That
 * is the same fraction the PWA icon puts it at, and that is the point: the
 * TWA and this app can be installed at once (`docs/CAPACITOR.md` §0), and two
 * icons drawn from one piece of artwork must not disagree about how big the
 * cube is. Full-bleed would have put it at 89% and made the pair look like a
 * mistake on the one home screen where both are visible.
 *
 * ── The bleed is copied, not filled ──────────────────────────────────────
 *
 * Something has to occupy the outer 18dp. A solid colour is the obvious
 * choice and it is wrong: the artwork is a vertical gradient, so a flat fill
 * meets it at a hard seam lying exactly on the mask boundary — the one place
 * the mask has stopped hiding things, and the one time it moves into view is
 * the parallax the bleed exists for. `extendWith: "copy"` replicates the edge
 * pixels instead, so the seam has a step of zero by construction and the band
 * differs from the gradient only in its slope.
 *
 * ── Why the artwork is the foreground layer and not the background ───────
 *
 * The two layers cannot carry a cube and its sky separately — the master is a
 * flat PNG and there is nothing to cut out — so one layer holds the picture
 * and the other is a colour. Which way round is not arbitrary:
 *
 * - Android 12+ draws the system splash from the icon's **foreground** layer.
 *   A transparent foreground is a blank circle on that screen.
 * - Parallax shifts the foreground. An opaque one that spans all 108dp can be
 *   shifted anywhere inside the bleed and still cover the mask.
 *
 * So the foreground is the artwork, and `@color/ic_launcher_background` is
 * `#1a1d21` — the same value as the splash, the shell and the WebView, for
 * the reason `capacitor/www/index.html` gives at more length: every surface
 * a player might see mid-launch is one colour, so no ordering of events can
 * produce a flash of something else. It shows only as a sliver under
 * parallax, and a sliver of the app's own background is the right sliver.
 */

import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { NIGHT_STOPS } from "../src/lib/sky-stops";

const ROOT = process.cwd();
const MASTER = path.join(ROOT, "assets", "icon-master.png");
/**
 * The feature graphic's picture. A generated cover rather than a screenshot,
 * which is allowed here and not in the screenshot slots: Play requires those
 * to be real gameplay, and asks only that this one be representative.
 */
const FEATURE_COVER = path.join(ROOT, "public", "covers", "island.png");
const RES = path.join(ROOT, "capacitor-android", "app", "src", "main", "res");

/** The app background, and every other surface visible during launch. */
const BACKGROUND = "#1a1d21";

/**
 * Density buckets, as multiples of mdpi. Android picks one by the device's
 * screen density and there is no fallback that is not a scaled-up blur, so
 * all five are written every time.
 */
const DENSITIES = [
  { dir: "mdpi", scale: 1 },
  { dir: "hdpi", scale: 1.5 },
  { dir: "xhdpi", scale: 2 },
  { dir: "xxhdpi", scale: 3 },
  { dir: "xxxhdpi", scale: 4 },
] as const;

/** Legacy launcher icon, pre-API-26 and still used by some launchers. */
const LAUNCHER_DP = 48;
/** An adaptive layer is 108dp of which the centre 72dp is displayed. */
const ADAPTIVE_DP = 108;
const SAFE_DP = 72;

/**
 * Splash sizes, taken from the Capacitor template rather than invented — the
 * drawable is picked by density and orientation, and a size that disagrees
 * with the bucket it sits in is a scaled bitmap for no reason.
 */
const SPLASH_PORTRAIT: Record<string, [number, number]> = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

/**
 * How much of the splash the mark occupies, as a fraction of the shorter
 * edge. The splash is a field of `BACKGROUND` with the mark centred on it;
 * the artwork's own sunset is not the background, because the background has
 * to be the colour everything else during launch already is.
 */
const SPLASH_ICON_FRACTION = 0.3;
/** Corner radius of the splash mark, as a fraction of its edge. */
const SPLASH_ICON_RADIUS = 0.22;

/** Template files the adaptive icon references nowhere. See the header. */
const TEMPLATE_LEFTOVERS = [
  path.join(RES, "drawable", "ic_launcher_background.xml"),
  path.join(RES, "drawable-v24", "ic_launcher_foreground.xml"),
];

/** The artwork as a square of `size`, and nothing else. */
function square(master: Buffer, size: number) {
  // `fit: "cover"` is a no-op on a square master and is the right behaviour
  // if one is ever replaced with something slightly off-square: crop rather
  // than letterbox, because a letterboxed launcher icon has bars.
  return sharp(master).resize(size, size, { fit: "cover" });
}

/** An SVG alpha mask, composited with `dest-in` to cut a shape out. */
function mask(size: number, shape: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${shape}</svg>`,
  );
}

// `ReturnType<typeof sharp>` rather than `sharp.Sharp`: the package is a
// CommonJS `export =`, so the default import is the callable and its type
// namespace is not in scope here.
function png(pipeline: ReturnType<typeof sharp>) {
  // The artwork is a smooth gradient, which is exactly what a palette would
  // band. Full colour, and every one of these is still a few kB.
  return pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
}

const written: Array<[string, string]> = [];

async function emit(file: string, data: Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
  written.push([
    path.relative(ROOT, file).replace(/\\/g, "/"),
    `${(data.length / 1024).toFixed(1)} kB`,
  ]);
}

/** A field of `BACKGROUND` with the mark centred on it. */
async function splash(master: Buffer, width: number, height: number) {
  const size = Math.round(Math.min(width, height) * SPLASH_ICON_FRACTION);
  const r = Math.round(size * SPLASH_ICON_RADIUS);
  const mark = await square(master, size)
    .ensureAlpha()
    .composite([
      {
        input: mask(
          size,
          `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>`,
        ),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return png(
    sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
      .composite([{ input: mark, gravity: "centre" }])
      // No alpha in the output: this is a window background, and a splash
      // with a transparent anything is a splash with whatever is behind it.
      // `flatten` composites the mark's rounded corners onto the field but
      // leaves the channel itself in place, so `removeAlpha` is what actually
      // makes the claim above true — and it is a quarter of the bytes of the
      // largest resources in the APK.
      .flatten({ background: BACKGROUND })
      .removeAlpha(),
  );
}

/**
 * The Play listing's 1024×500 feature graphic.
 *
 * The night sky the game is played under, the island cover at its native
 * 640×400 (scaling a pixel-crisp render up is the one way to make it look
 * cheap), and the mark and name on the left — Play draws nothing over the
 * left of this image, and the right is where a phone crops it first.
 *
 * Text is rendered by librsvg with whatever fonts the machine has, so the
 * glyphs can differ between machines. That is why the freshness check hashes
 * the inputs rather than the output, the same as the icons.
 */
async function featureGraphic(master: Buffer) {
  const W = 1024;
  const H = 500;
  const stops = NIGHT_STOPS.map(
    (s) => `<stop offset="${1 - s.at}" stop-color="${s.hex}"/>`,
  )
    .reverse()
    .join("");
  const sky = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
      `<g font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="#edf0f3">` +
      `<text x="64" y="268" font-size="54" font-weight="700">Spec Driven</text>` +
      `<text x="64" y="330" font-size="54" font-weight="700">Games</text>` +
      `<text x="64" y="378" font-size="20" fill="#c3c9d0">Build worlds from blocks.</text>` +
      `<text x="64" y="406" font-size="20" fill="#c3c9d0">Then play and race through them.</text>` +
      `</g></svg>`,
  );

  const size = 88;
  const r = Math.round(size * SPLASH_ICON_RADIUS);
  const mark = await square(master, size)
    .ensureAlpha()
    .composite([
      {
        input: mask(size, `<rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/>`),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();

  return png(
    sharp(sky)
      .composite([
        { input: await readFile(FEATURE_COVER), left: W - 640 - 24, top: (H - 400) / 2 },
        { input: mark, left: 64, top: 110 },
      ])
      // Play states "JPEG or 24-bit PNG (no alpha)".
      .flatten({ background: BACKGROUND })
      .removeAlpha(),
  );
}

async function main() {
  const master = await readFile(MASTER);

  const meta = await sharp(master).metadata();
  if (meta.width !== meta.height) {
    throw new Error(`the master must be square, got ${meta.width}x${meta.height}`);
  }
  // Every target is derived from it, and the largest is the 512 store icon.
  if ((meta.width ?? 0) < 512) {
    throw new Error(`the master is ${meta.width}px; every target is derived from it`);
  }

  for (const { dir, scale } of DENSITIES) {
    const mip = path.join(RES, `mipmap-${dir}`);

    // 1. The legacy icon: the artwork, full-bleed. A launcher that does not
    //    do adaptive icons applies its own rounding to this.
    const legacy = Math.round(LAUNCHER_DP * scale);
    await emit(path.join(mip, "ic_launcher.png"), await png(square(master, legacy)));

    // 2. The round icon, for launchers that ask for one by name. Nothing
    //    masks these, so the circle has to be in the file.
    await emit(
      path.join(mip, "ic_launcher_round.png"),
      await png(
        square(master, legacy)
          .ensureAlpha()
          .composite([
            {
              input: mask(
                legacy,
                `<circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}" fill="#fff"/>`,
              ),
              blend: "dest-in",
            },
          ]),
      ),
    );

    // 3. The adaptive foreground: the artwork mapped onto the visible 72dp,
    //    with the 18dp bleed copied out of its edge pixels. See the header
    //    for why it is this layer and why the bleed is a copy.
    const layer = Math.round(ADAPTIVE_DP * scale);
    const inner = Math.round(SAFE_DP * scale);
    const bleed = (layer - inner) / 2;
    if (!Number.isInteger(bleed)) {
      throw new Error(`${dir}: a ${layer}px layer cannot centre a ${inner}px square`);
    }
    await emit(
      path.join(mip, "ic_launcher_foreground.png"),
      await png(
        square(master, inner).extend({
          top: bleed,
          bottom: bleed,
          left: bleed,
          right: bleed,
          extendWith: "copy",
        }),
      ),
    );

    // 4. The splash, both ways up. The drawable is chosen by orientation as
    //    well as density, and a portrait bitmap stretched across a landscape
    //    window is the tell that nobody checked.
    const [pw, ph] = SPLASH_PORTRAIT[dir];
    for (const [w, h, folder] of [
      [pw, ph, `drawable-port-${dir}`],
      [ph, pw, `drawable-land-${dir}`],
    ] as const) {
      await emit(path.join(RES, folder, "splash.png"), await splash(master, w, h));
    }
  }

  // The orientation-less fallback. The template ships landscape mdpi here and
  // there is no reason to disagree with it: it is what a device with no
  // matching qualifier gets, which in practice is nothing modern.
  await emit(path.join(RES, "drawable", "splash.png"), await splash(master, 480, 320));

  // The adaptive icon's other layer. The XML already points at this colour,
  // so the file is the whole change — it was the template's #FFFFFF, which
  // would have shown as a white sliver under parallax.
  await emit(
    path.join(RES, "values", "ic_launcher_background.xml"),
    Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>\n` +
        `<!-- Written by scripts/generate-android-assets.ts. The app background,\n` +
        `     and the one thing behind the adaptive icon's foreground layer. -->\n` +
        `<resources>\n` +
        `    <color name="ic_launcher_background">${BACKGROUND}</color>\n` +
        `</resources>\n`,
    ),
  );

  // The Play listing's icon, and the one place the alpha channel goes the
  // other way from the splash: Play states the format as 32-bit PNG, so the
  // channel has to be there — and every pixel of it has to be 255, because
  // Play applies its own mask and shadow and composites what it is given
  // onto white. `ensureAlpha` with no argument fills it opaque.
  await emit(
    path.join(ROOT, "capacitor-android", "store_icon.png"),
    await png(square(master, 512).ensureAlpha()),
  );

  await emit(
    path.join(ROOT, "capacitor-android", "feature_graphic.png"),
    await featureGraphic(master),
  );

  // What the set was derived from, so a test can tell a fresh set from a
  // stale one. Same argument as `coverKey` in `lib/world-cover.ts`: the
  // output is committed, so the thing that has to fail is artwork changing
  // without a regenerate — and hashing the INPUT does that without depending
  // on two machines' libvips encoding a PNG to identical bytes.
  //
  // It does not notice the generator's own constants changing. Neither does
  // `coverKey`, and the honest scope of both is "the source moved".
  await emit(
    path.join(ROOT, "capacitor-android", "icon-master.sha256"),
    Buffer.from(`${createHash("sha256").update(master).digest("hex")}\n`),
  );

  for (const file of TEMPLATE_LEFTOVERS) {
    if (existsSync(file)) {
      await unlink(file);
      written.push([path.relative(ROOT, file).replace(/\\/g, "/"), "removed"]);
    }
  }

  const width = Math.max(...written.map(([f]) => f.length));
  for (const [file, note] of written) console.log(`${file.padEnd(width)}  ${note}`);
  console.log(`\n${written.length} files. Rebuild with npm run cap:build.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
