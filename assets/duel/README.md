# Ragdoll Rumble — Asset & Performance Pack (v1)

Built to match **specdrivengames.com** as it appears in the 2026-09-23 screen recording. It uses the same near-black navy, cyan JUMP accent, lime CTA and mono labels as the site. The fighter is **your white robot mascot**, drawn as a 2D ragdoll, so the duel game feels like part of the same world as Parkour.

Everything here is original and generated from code. No Higgsfield art is included because that account was out of credits. The generator scripts in `tools/` rebuild the whole pack in about 30 seconds.

## What's inside

```
textures/
  atlases/     robot, items, ui, vfx — .webp (runtime) + .png (fallback) + Phaser JSON-hash, @1x and @2x
  arenas/<id>/ bg_far(@2x).webp, bg_mid(@2x).webp, tiles.webp + tiles.json (3 block tiles + 4 hazard frames)
models/
  data/        fighter_robot.ragdoll.json (14 bodies, 13 joints, limits, motors), weapons.json (8), cosmetics.json (12 hats, 6 colours)
  arenas/      magma_gauntlet / ice_cascade / violet_loom / island_garden .json — platforms, moving platforms, hazards, spawns (64px tiles, 30×17)
  3d/          robot_{violet,orange,cyan,pink,lime,yellow}.glb (500 tris each), trophy.glb (752 tris) — vertex-coloured, no textures
code/          tokens.css, controls.ts, quality.ts, manifest.ts, preload.ts, ragdoll.ts, pool.ts, fixedStep.ts
source_svg/    editable vector source for every sprite
tools/         Python generators (Pillow, numpy, cairosvg, trimesh)
previews/      arena mock-ups, atlas sheet, 3D model render
```

## Payload budget

| Load | Contents | Size |
|---|---|---|
| Menu (low/medium tier) | 4 atlases @1x + 3 JSON data files | ~70 KB |
| Menu (high tier) | 4 atlases @2x | ~135 KB |
| Per match | one arena: far + mid + tiles | 45–125 KB |
| Optional | one robot GLB for a three.js menu/results scene | 11 KB |

That comes to well under 300 KB of art for a full match, against the 2.5 MB first-playable budget in the spec.

## Drop-in steps

1. Copy `textures/` and `models/` to `public/duel/`. Put `code/*` in `games/duel/engine/`. Import `code/tokens.css` on the `/duel` route only.
2. At boot, run `const tier = detectTier(); const q = PROFILES[tier];`, then `preloadCore(scene, q)`.
3. When the arena is chosen, call `preloadArena(scene, id, q, previousId)`. Only one arena is ever resident.
4. Spawn fighters with `buildRobot(scene, cache.json.get('ragdoll'), x, y, 0xA654F4, q.atlasScale)`. Each fixed step, call `enforceLimits()`. Each render, call `sync()`.
5. Mount the controls with `mountControls(document.body, mode === 'local2p')`. The stick is the site's dark base with a white knob, and JUMP has the same cyan ring as Parkour.
6. Wrap Matter updates in `makeFixedStep(...)`. Feed `AdaptiveQuality.sample(frameMs)` every frame.

## Performance rules baked in

- **Few draw calls.** Each atlas is one texture, so a whole fighter plus its weapon and hat batches into about 3 draws. The limbs are greyscale and tinted per player, so 6 colours cost 0 extra textures.
- **Glow without shaders.** Glow uses pre-baked `glow_disc` / `glow_soft` sprites drawn with ADD blend, not post-processing bloom. This is cheap even on low-end Android.
- **Pooled VFX.** `VfxPool` preallocates every particle sprite, so nothing is allocated during a match and the garbage collector doesn't cause stutters. The particle cap comes from the quality tier.
- **Tiered assets.** Low and medium tiers load the @1x atlases, and high tier loads @2x drawn at 0.5 scale. Renderer resolution is capped at 1 / 1.5 / 2× device pixel ratio. Low tier drops the mid parallax layer and the weapon trails.
- **Adaptive downgrade.** If the 90th-percentile frame time runs more than 25% over budget for about 3 seconds, the game drops one tier. It never upgrades mid-match, to avoid visible popping.
- **Fixed 60 Hz physics.** Physics runs on a fixed step with at most 4 catch-up steps, which stops the "spiral of death" after a tab switch. Constraint iterations are 3/4/6 by tier.
- **WebP everywhere.** Backgrounds are lossy q80. Atlases are q92, which keeps outlines crisp, and tile sheets are lossless. The PNG copies exist only for tooling and old browsers, so don't ship them if you don't need them.
- **Power-of-two textures with 2 px padding and a 1 px edge extrude**, so there is no mipmap/filter bleeding between frames.
- **Reduced motion.** `reducedMotion()` lets you turn off shake and slow-mo, and `tokens.css` removes the button glow.

## Arenas

| Arena | Blocks | Hazard (on a readable "beat") |
|---|---|---|
| Magma Gauntlet | yellow voxel, lava sea (nods to your daily challenge) | lava rises every 12 s with a 2 s warning → instant KO |
| Ice Cascade | cyan voxel, low friction | falling pillars every 8 s; ring-out below the stage |
| Violet Loom | woven purple tiles | laser sweep every 9 s; portal pair |
| Island Garden | grass/dirt voxel, night sky and moon (like the Parkour card) | side ledges crumble 1.2 s after landing; ring-out |

## Notes

- The label font in `tokens.css` is a stand-in. Set `--sdg-mono` to the font your site actually uses.
- The weapon hitboxes in `weapons.json` are approximations of the sprites. Tune them in the Training mode once it exists.
- To regenerate everything, run `pip install pillow numpy cairosvg trimesh`, then run the scripts in `tools/` in this order: `gen_svg`, `recolor`, `gen_robot`, `build_atlas`, `build_arenas`, `build_3d`, `preview`.
