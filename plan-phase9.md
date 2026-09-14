# Phase 9 — Textured blocks: a surface per part, one texture array, no new draw calls

Source: `TEXTURE_SYSTEM.md` (the Blockworld texture system spec). This document
is that spec read against the code that exists, which — as with every phase
before it — moves some of it to "built", and moves three of its assumptions
from "obvious" to "wrong here".

**Decided before writing:**

- A part gains an **optional eighth field, `texture`**. Seven-number tuples stay
  valid forever; every shipped course, every saved world and every op on the
  wire keeps parsing. Nothing is migrated.
- Textures are **tint maps, not colour maps**. CLAUDE.md is explicit that in
  this game the palette colour a player placed *is* the content. So a texture
  supplies structure — luminance, normal, roughness — and the palette supplies
  the hue, exactly as the spec's own Part 9 tints one texture into forty
  shades. Grass in `#22c55e` is grass; grass in `#a855f7` is alien grass; and a
  world saved last week renders identically because "no texture" is a flat
  mid-grey layer that multiplies by exactly one.
- **Triplanar in world space replaces both the atlas and the UV path.** Part 6
  assumes a mesher that writes UVs; this game draws `RoundedBoxGeometry`, an
  extruded ramp and a hand-built wedge that has *no UV attribute at all*. World
  position at one tile per unit gives every face of a unit cube exactly one
  tile, works on the ramp and the wedge without touching them, and tiles
  continuously across a floor instead of visibly repeating per block. Parts 6
  and 7 are therefore the same feature.

## 0. What already exists

| Spec asks for | Status |
|---|---|
| Part 10 tone mapping, environment probe, one shadow caster, tight shadow box, fog matched to the horizon | **Done, and load-bearing.** ACES at 1.05, `RoomEnvironment` at 0.4 under every sky (`atmosphere.ts` explains why a night probe is wrong), `FollowSun` walks the shadow box with the player, `NIGHT_LOOK` binds fog to the horizon stop. `npm run light:check` holds every finish and palette colour within 75% of the studio. **Not touched by this phase** — the spec's static HDRI would fight the day cycle and repaint the palette. |
| Part 12 three tiers, a player override | **Done.** `lib/quality.ts`, measured against real triangle counts, override in the settings dialog. Missing: texture/post/detail fields and the adaptive drop. |
| Part 5 shared materials, module scope | **Done as a repo rule.** `createFinishMaterial` per bucket; CLAUDE.md bans `useMemo` for materials. |
| Part 14 disposal | **Done per bucket.** Every `Bucket` disposes its material on unmount. The arrays this phase adds are process-lifetime singletons, like the palette materials in `block-materials.ts`, and for the same reason: bounded key space, nothing to reclaim. |
| Part 9 per-instance colour | **Done — it is the whole rendering model.** `instanceColor` from the palette index. |
| Part 3 `sharp`, `@gltf-transform/cli` | Installed. |
| Part 1 provenance file | Nothing textured exists yet. `public/textures/CREDITS.md` is written by the fetch script. |

## 1. What is genuinely new

### 1A. The document

`PartTuple` becomes `[x, y, z, shape, color, finish, rot, texture?]`.
`TEXTURES` is the authority for what index means what, and lives in
`lib/texture-list.ts` with no imports — the build script and the editor both
read it, and the script cannot pull zod and three into a Node process. The
list is **append-only**: an index is stored in every saved world.

`partTuple` (zod) gains a trailing optional element; `ops.ts` and the room
server validate through the same schema, so a peer sending a textured part is
accepted and one sending index 99 is not. `world-session.ts` mirrors caps, not
tuple shape — no change.

Store: a `texture` brush field, carried by `place`, compared by `paint`,
adopted by `pick`. Nothing else in the store reads tuple fields past `[6]`.

### 1B. The asset pipeline

- `scripts/fetch-textures.ts` — Poly Haven's public API, 1K JPG, `Diffuse` +
  `nor_gl` + `Rough` + `AO`, into `assets/raw-textures/<slot>/` (gitignored,
  same rule as raw props and characters). Writes `public/textures/CREDITS.md`.
  Every asset is CC0; ambientCG's download endpoint redirects to an HTML page
  from a script, so Poly Haven is the single source.
- `scripts/build-textures.ts` — one 256² tile per slot, stacked into strips:
  - `block_surface.png` — **R** = luminance normalised to a mean of 0.5 with AO
    multiplied in, **G** = roughness normalised the same way. The shader
    doubles both, so a flat 128 layer is the identity. AO is baked here rather
    than sampled, which removes the spec's `uv1` gotcha entirely.
  - `block_normal.png` — the GL normal, RGB.
  - `block_manifest.json` — `{ tile, layers }`, checked against `TEXTURES` at
    build time so the strip and the document can never disagree on an index.
  - `detail_noise.png` — 256² tileable grey noise for Part 8, generated, not
    downloaded.
- Layer 0 (`plain`) is generated flat: 128/128 surface, (128,128,255) normal.
- Generated output **is committed**: it is ~1 MB and the deploy builds from
  git without the raw downloads. Rebuild with `npm run textures`.

KTX2 (Part 3.2) needs the KTX-Software toolchain, which is not on this machine
and not in `node_modules`. The PNG strips ship; the `ktx create` step is
recorded in the script header as the release-time follow-up.

### 1C. The renderer

One `DataArrayTexture` pair for the whole game (`lib/textures/block-arrays.ts`),
loaded once, read from React through `useSyncExternalStore`. Anisotropy from
the tier; `NearestMipmapLinear` on the surface map so blocks stay crisp.

Per instance, one float: `aTexture`, an `InstancedBufferAttribute`. **This is
what keeps the draw-call count where it is.** Buckets stay `(shape, finish,
ground, chunk)`; a bucket of matte blocks in eleven different textures is
still one draw call. The attribute has to live on the geometry, and the
geometries are shared at module scope — so each bucket clones its shape
geometry (a few kilobytes) and owns the clone, disposing it with its material.
`instance-texture.ts` writes the attribute for both instanced renderers, so
the editor and Play cannot drift.

`createFinishMaterial(finish, arrays)` injects via `onBeforeCompile`, which
keeps every bit of `MeshStandardMaterial`'s lighting and shadowing:

- vertex: `aTexture → vTexture`, plus world position and world normal
  varyings computed through `instanceMatrix`.
- `map_fragment`: triplanar sample of the surface array, blend `pow(|n|, 8)`,
  `diffuseColor.rgb *= R * 2`. The instance colour multiplies in
  `color_fragment` as it always has — that is the tint.
- `roughnessmap_fragment`: `roughnessFactor = roughness * G * 2`, so `matte`
  stays matte and `glossy` stays glossy; the texture only modulates.
- `normal_fragment_maps`: UDN-blended triplanar normal in world space, then
  into view space with `viewMatrix`. Off at `low` — one array, three fetches.
- Part 8 detail: same blend weights, one grey texture at 24 tiles per unit,
  faded out past 8–20 m so it never shimmers at distance.
- `customProgramCacheKey` names finish, texture mode and detail, so three's
  program cache never hands a patched material an unpatched program — the
  same lesson the emissive finish already records.

### 1D. Tiers, post, precompile

- `RenderQuality` gains `textures: "flat" | "surface" | "full"`, `detail`,
  `anisotropy`, `post`. Low = surface only, no normal map, no detail, no post.
- `monitorFrame` from Part 12: sixty slow frames drops one tier, **session
  only** and **never over the player's override**. The player who set High
  knows what they asked for.
- Part 11: `@react-three/postprocessing` — Bloom (threshold 0.75) + Vignette,
  Play and Race only. The editor keeps a clean frame for judging a colour.
  Emissive finish is already at 1.4, which is past the threshold.
- Part 13: `gl.compile(scene, camera)` once the arrays are in, behind the
  existing loader, so the first textured bucket does not hitch.

## 2. Out of scope, and why

- **Part 10.** See table. Touching the lights re-litigates a decision the
  repo made three times.
- **Part 6's atlas fallback.** three r185 is WebGL2-only; there is no WebGL1
  to fall back for.
- **Appendices A/B.** Every slot is covered by a CC0 photographic set; the
  derived-map script is unnecessary while that holds.
- **Hero canvas post-processing.** It is a landing page.

## 3. Verification

The spec's Part 15, restated for this repo:

- `npm test` — schema accepts 7- and 8-tuples, rejects index ≥ `TEXTURES.length`;
  `ops.test.ts` round-trips a textured replace; `instance-texture.test.ts`
  writes the attribute a bucket expects.
- `npm run textures` — strip height equals `TEXTURES.length × 256`, manifest
  order equals `TEXTURES`.
- `npm run lint`, `npx tsc --noEmit`, `next build`.
- In the browser: plain blocks render pixel-identical to before (layer 0 is
  the identity); `?perf=1` shows the same `calls` on Neon Circuit as before
  this phase; a textured floor tiles continuously across blocks.
