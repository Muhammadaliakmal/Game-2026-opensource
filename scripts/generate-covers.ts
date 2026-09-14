/**
 * Renders a bird's-eye cover for every built-in world.
 *
 * ── Why a script and not a component ─────────────────────────────────────
 *
 * The picture is one polygon per visible block face, and the worlds are big:
 * Vapor Ridge is 10,762 parts and just under 30,000 quads, which is 2.3 MB of
 * SVG. Inlining that into the games hub — six cards on the front page — would
 * be several megabytes of markup to save a few kilobytes of PNG. Rendered
 * once, each is 20-60 kB of flat colour that compresses extremely well.
 *
 * So: generated, and the output is committed, exactly like the block surface
 * strips and for the same reason — the deploy builds from git and must not
 * need a render step. Re-run with `npm run covers`.
 *
 * ── Why this is not the spec's capture pipeline ──────────────────────────
 *
 * BIRDS_EYE_THUMBNAILS.md proposes a hidden `/dev/thumbnail/[id]` route, a
 * real WebGL render with `preserveDrawingBuffer`, and Playwright driving it.
 * That is the right design for a game whose levels are `.glb` files, which is
 * what it was written against. Here a world is not a file — it is a function
 * that returns part tuples — so there is nothing to load in a browser, and
 * `lib/world-cover.ts` can draw the same picture from the same data with no
 * GPU, no server and no browser at all.
 *
 * That also settles the spec's own verification item about captures being
 * reproducible: this is a pure function of the parts, so re-running on an
 * unchanged world is byte-identical by construction rather than by luck. No
 * particle system or time-of-day can leak into it, because none is involved.
 *
 * `npm run bike:preview` already makes this argument — it rasterises a GLB on
 * the CPU precisely because the question it answers cannot wait for a browser.
 *
 * ── The manifest ─────────────────────────────────────────────────────────
 *
 * Alongside the images, `src/lib/world-covers.json` carries a blur-up
 * placeholder and a `key` — a hash of the part data each cover was drawn
 * from. `world-cover.test.ts` recomputes those keys and fails if a world has
 * been edited without re-running this, which is the freshness guard the spec
 * asks for in Part 10, against the parts rather than against a file.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BUILT_IN_WORLDS, buildBuiltInDoc } from "../src/lib/built-in-worlds";
import { COVER_H, COVER_W, coverKey, coverSvg } from "../src/lib/world-cover";

const OUT = path.join(process.cwd(), "public", "covers");
const MANIFEST = path.join(process.cwd(), "src", "lib", "world-covers.json");

/** The blur-up source. Tiny on purpose — it is inlined into the HTML. */
const BLUR_W = 16;

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest: Record<string, { key: string; blur: string }> = {};
  let total = 0;

  for (const world of BUILT_IN_WORLDS) {
    const doc = buildBuiltInDoc(world.slug, "covers");
    if (!doc) throw new Error(`${world.slug} did not build`);

    // Transparent, so the card's own panel and accent show through rather
    // than the cover bringing a competing background of its own.
    const svg = Buffer.from(coverSvg(doc.parts));

    const png = await sharp(svg)
      .resize(COVER_W, COVER_H, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    await writeFile(path.join(OUT, `${world.slug}.png`), png);

    const blur = await sharp(png)
      .resize(BLUR_W, Math.round((BLUR_W * COVER_H) / COVER_W))
      .png({ compressionLevel: 9 })
      .toBuffer();

    manifest[world.slug] = {
      key: coverKey(doc.parts),
      blur: `data:image/png;base64,${blur.toString("base64")}`,
    };

    total += png.length;
    console.log(
      `${world.slug.padEnd(14)} ${String(doc.parts.length).padStart(6)} parts  ` +
        `${(png.length / 1024).toFixed(1).padStart(6)} kB`
    );
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(
    `\n${BUILT_IN_WORLDS.length} covers, ${(total / 1024).toFixed(0)} kB total ` +
      `(${(total / 1024 / BUILT_IN_WORLDS.length).toFixed(1)} kB average)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
