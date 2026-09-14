import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TEXTURES, TEXTURE_TILE } from "./texture-list";

const GENERATED = join(process.cwd(), "public", "textures", "generated");

test("every surface has a distinct name and plain is the only generated layer", () => {
  const names = new Set(TEXTURES.map((t) => t.name));
  assert.equal(names.size, TEXTURES.length);
  assert.deepEqual(
    TEXTURES.filter((t) => t.source === null).map((t) => t.name),
    ["plain"]
  );
});

test("the committed strip was built from this exact list", () => {
  // The document stores an index into TEXTURES and the shader samples layer
  // `index` of the strip. The manifest is the proof the two agree; a strip
  // from a stale build would silently retexture every world.
  const manifestPath = join(GENERATED, "block_manifest.json");
  assert.ok(existsSync(manifestPath), "run `npm run textures`");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    tile: number;
    layers: string[];
  };
  assert.equal(manifest.tile, TEXTURE_TILE);
  assert.deepEqual(
    manifest.layers,
    TEXTURES.map((t) => t.name)
  );
  for (const file of ["block_surface.jpg", "block_normal.jpg", "detail_noise.png"]) {
    assert.ok(existsSync(join(GENERATED, file)), `${file} missing — run \`npm run textures\``);
  }
});

test("CREDITS.md names every downloaded surface", () => {
  const credits = readFileSync(join(process.cwd(), "public", "textures", "CREDITS.md"), "utf8");
  for (const t of TEXTURES) {
    if (!t.source) continue;
    assert.ok(credits.includes(`| ${t.name} |`), `${t.name} has no provenance row`);
    assert.ok(credits.includes(`polyhaven.com/a/${t.source}`), `${t.name} source not credited`);
  }
});
