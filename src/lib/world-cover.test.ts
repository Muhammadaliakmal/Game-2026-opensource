import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { BUILT_IN_WORLDS, buildBuiltInDoc } from "./built-in-worlds";
import { COVER_RIG, coverKey, coverSvg } from "./world-cover";
import covers from "./world-covers.json";

/**
 * The covers, held to the worlds they are pictures of.
 *
 * ── The failure this exists to prevent ───────────────────────────────────
 *
 * CLAUDE.md rules out screenshots for cover art, and the reason is not that
 * images are bad — it is that a captured image goes stale silently. Edit a
 * generator, and the card keeps advertising last month's terrain to a player
 * choosing a level on the strength of it. Nothing errors, nothing looks
 * broken, and the only way to find out is to play the level and notice.
 *
 * So the covers are generated from `WorldDoc.parts` and the manifest records
 * a hash of the parts each was drawn from. This recomputes those hashes. A
 * world edited without `npm run covers` fails here instead.
 */

const MANIFEST: Record<string, { key: string; blur: string }> = covers;
const DIR = path.join(process.cwd(), "public", "covers");

test("every built-in world has a committed cover", () => {
  for (const w of BUILT_IN_WORLDS) {
    assert.ok(
      existsSync(path.join(DIR, `${w.slug}.png`)),
      `public/covers/${w.slug}.png is missing — run npm run covers`
    );
    assert.ok(MANIFEST[w.slug], `${w.slug} is not in world-covers.json`);
  }
});

test("no cover is left over from a world that no longer exists", () => {
  // The other direction, which matters when a world is renamed: a stale entry
  // is a file nobody notices shipping, and a slug that silently resolves to
  // the wrong picture if it is ever reused.
  const slugs = new Set(BUILT_IN_WORLDS.map((w) => w.slug));
  for (const slug of Object.keys(MANIFEST)) {
    assert.ok(slugs.has(slug), `${slug} is in the manifest but is not a world`);
  }
});

test("every cover was drawn from the world as it is now", () => {
  const stale: string[] = [];
  for (const w of BUILT_IN_WORLDS) {
    const doc = buildBuiltInDoc(w.slug, "test");
    assert.ok(doc, `${w.slug} did not build`);
    if (MANIFEST[w.slug]?.key !== coverKey(doc.parts)) stale.push(w.slug);
  }
  assert.deepEqual(
    stale,
    [],
    `these worlds changed since their cover was drawn — run \`npm run covers\`: ${stale.join(", ")}`
  );
});

test("a blur placeholder is small enough to inline", () => {
  // It is base64 in the HTML of every card on the page. A full-size image
  // here would be invisible in review and expensive on every load.
  for (const [slug, entry] of Object.entries(MANIFEST)) {
    assert.ok(entry.blur.startsWith("data:image/png;base64,"), `${slug}: not a data URL`);
    assert.ok(entry.blur.length < 1200, `${slug}: blur is ${entry.blur.length} bytes`);
  }
});

test("drawing the same world twice gives the same picture", () => {
  // The freshness test above is a hash comparison, which is only meaningful
  // if the renderer is deterministic. Nothing in it may depend on a clock, on
  // Math.random or on map iteration order.
  const doc = buildBuiltInDoc("parkour", "test")!;
  assert.equal(coverSvg(doc.parts), coverSvg(doc.parts));
});

test("the picture is drawn from above, and not from straight above", () => {
  // Part 0 of the spec, as an assertion. A 90-degree elevation flattens every
  // parkour course into a plan, which is the one thing a course card must not
  // do; a very shallow one stops reading as "from above" at all.
  assert.ok(COVER_RIG.elevationDeg > 25, "too shallow to read as a bird's-eye view");
  assert.ok(COVER_RIG.elevationDeg < 60, "too close to a flat top-down — height collapses");
});

test("a world with no parts produces a valid, empty picture", () => {
  // /browse renders user worlds through the same card. An empty or broken doc
  // must give an empty frame rather than throwing during a server render.
  const svg = coverSvg([]);
  assert.ok(svg.startsWith("<svg"), "not an SVG");
  assert.ok(svg.endsWith("</svg>"), "truncated SVG");
  assert.ok(!svg.includes("NaN"), "NaN in the output");
});

test("nothing in a cover lands outside its frame", () => {
  // The fit is one scale for both axes plus a padding ratio. Getting that
  // wrong crops a world rather than shrinking it, and a cropped level preview
  // is worse than none — it shows a shape that is not the level's.
  const doc = buildBuiltInDoc("island", "test")!;
  const svg = coverSvg(doc.parts, { width: 640, height: 400 });
  for (const m of svg.matchAll(/points="([^"]+)"/g)) {
    for (const pair of m[1].split(" ")) {
      const [x, y] = pair.split(",").map(Number);
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `non-finite point ${pair}`);
      assert.ok(x >= -1 && x <= 641, `x ${x} is outside the frame`);
      assert.ok(y >= -1 && y <= 401, `y ${y} is outside the frame`);
    }
  }
});
