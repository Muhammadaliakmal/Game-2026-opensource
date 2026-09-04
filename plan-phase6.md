# Phase 6 — "Neon Drift": UI system, controls, parkour progression, perf

Source: the NEON DRIFT UI/UX + performance spec (Sept 2026). This document
reconciles that spec against what Blockworld already is, and sequences the work.

---

## 0. What the spec asks for that already exists

Worth stating plainly so we do not rebuild working code:

| Spec item | Status here |
|---|---|
| HUD as DOM overlay over the Canvas, not in WebGL | **Done.** Every HUD (`RaceHud`, `ArenaHud`, `Toolbar`) is absolutely-positioned DOM over the `<Canvas>`. |
| Canvas is a client component, `dynamic(..., { ssr:false })` | **Done**, and enforced in `CLAUDE.md`. |
| `InstancedMesh`, not one mesh per block | **Done.** `InstancedWorld`/`InstancedParts` bucket by (shape x finish). |
| Draw calls under ~100 | **Already there.** 4 shapes x 4 finishes = a 16-bucket ceiling for the whole voxel world, plus props. |
| `frameloop="demand"` for static/idle screens | **Done**, and the editor is on `"demand"` by design. |
| A 16.6 ms budget + an FPS / `renderer.info` dev overlay | **Done** — `components/perf/PerfPanel.tsx`, `PerfProbe.tsx`. |
| Greedy meshing | **Done for colliders** (`lib/greedy-mesh.ts`). See finding B for the visual side. |
| Device-tier detection, lighter assets on weak devices | **Done** — `lib/quality.ts`, three tiers with a player override. |
| Cosmetic-only monetisation, no predatory mechanics | **Already a hard constraint** in `SPEC.md` §1. The spec's §5 agrees with it. |
| Per-map timer + personal best | **Partly** — `components/play/course.ts` has a run clock and a localStorage PB. No medals, no ghosts, no leaderboard. |

## 1. What is genuinely missing

- **A design-token system for the neon look.** See the open decision in §4.
- **Key remapping.** `play/controls.ts` and `race/controls.ts` are hard-coded
  drei `KeyboardControls` maps. No settings UI, no persistence, no presets.
- **Racing verbs.** There is no boost/nitro, no drift/handbrake with a meter, no
  trick, no look-back, no camera cycle. `raceKeyboardMap` is five keys.
- **A speedometer.** The spec calls speed and race position the two things no
  racing game omits; `RaceHud` has position and lap, and no speed.
- **Mobile control schemes.** `TouchControls` is a jump button and a joystick.
  No tilt/tap/assist steering for racing, no contextual clusters, no haptics.
- **Parkour as a mode.** `lib/parkour.ts` builds *one* default course. There are
  no checkpoints, no respawn-to-checkpoint, no medals, no ghosts, no tiering,
  no map set.
- **Progression.** No XP, no unlocks, no daily goals, no leaderboards. The DB
  has exactly one table (`worlds`); every one of these needs schema.
- **Build-mode conventions.** No creative fly (double-tap Space), no hotbar
  1-9 + scroll, no middle-click pick, no Ctrl+Z/Y.
- **Reduced-motion handling** for the juice the spec asks for.

## 2. Three places the spec is wrong *for this codebase*

Recorded so we do not spend a week on them.

**A. Greedy-meshing the visual voxels would not help, and would cost fidelity.**
The spec's warning is about naive per-cube rendering at ~10 fps. That is not
what runs here: the whole world is at most 16 instanced draw calls. Greedy face
merging also assumes plain cubes with coplanar faces — Blockworld's parts are
*chamfered* cubes, slabs, ramps and wedges with per-instance colour and four
finishes. There are no coplanar faces to merge, and merging would delete the
chamfer that gives the world its look. The measured problem was never draw
calls; `lib/quality.ts` records it as **triangles** (2.53M camera + 2.53M
shadow), and the fix already shipped: `blockDetail` and `groundCastsShadow`.
Anything further belongs in that same file, not in a rewrite of the renderer.

**B. Web-worker chunk meshing solves a problem we do not have.** It follows
from A. Worker meshing is worth it when remeshing costs 30-45 ms per chunk;
writing instance matrices costs a matrix write per block.

**C. The WebGPU swap is real but should stay last, and it is not one line
here.** `components/sky/sky-shader.ts` is hand-written GLSL and would need TSL
conversion; `@react-three/rapier` v2, `ecctrl` v2 and drei v10 all need
verifying against `three/webgpu`. The payoff the spec quotes (20-40%) is for
10,000+ draw-call scenes. We have ~20. Revisit after Stage 2, and only if the
perf overlay says the GPU is the bottleneck.

## 3. Sequence

Each sub-phase is independently shippable and has its own acceptance criteria.

### 6a — Design system (blocked on the §4 decision)
Extend `tokens.css` with the chosen accent system; add glass and neon surface
recipes to `globals.css` alongside the existing `.hud-panel`; add the display +
mono type pairing. Establish the shared screen-zone grid as one layout
component the three HUDs consume, so placement is defined once.
**Accept:** all three HUDs render through the zone grid; no HUD hard-codes a
corner; reduced-motion honoured; existing pages unchanged in structure.

### 6b — Controls: remapping + racing verbs
A `lib/keybinds.ts` store (persisted, with presets) that both control maps read
from, replacing the two hard-coded arrays. Then boost/nitro, drift/handbrake,
look-back, camera cycle, respawn on the bike, with the meter and speedometer in
`RaceHud`.
**Accept:** every desktop action is rebindable and survives reload; conflicts
are shown; speed and boost are on screen; `npm test` covers the bind resolver.

### 6c — Mobile control schemes
Thumb-zone layout at >=48px with ~8px spacing and haptics; the three racing
schemes (tilt / tap / assist) with assist as the default; contextual build and
parkour clusters; fly toggle and hotbar for build.
**Accept:** playable one-thumb-per-side on a phone; targets pass the 44x44
floor; scheme choice persists.

### 6d — Parkour mode
Checkpoints in `WorldDoc` (a new part kind or a marker list — decide in 6d),
respawn to last checkpoint with position *and* rotation, instant restart, and
the pacing/teaching structure applied to a 5-map tiered set.
**Accept:** dying returns you in <300 ms to the last checkpoint with the level
un-reset; five maps exist at Tutorial..Expert.

### 6e — Progression: medals, ghosts, leaderboards
Schema first (`runs`, `ghosts`, `unlocks`), then Bronze/Silver/Gold/Author
medals per map, ghost record + replay, global and friends boards. Design the
row shape now so multiplayer slots in later, per the spec.
**Accept:** a run writes a row; a PB ghost replays against you; medals gate the
next tier.

### 6f — Juice, then perf re-measure
Screen shake, hit-stop (40-80 ms), particle bursts, <=100 ms feedback on every
input — all gated behind `prefers-reduced-motion`. Then re-run the perf overlay
on the tier-3 device budget and decide about WebGPU with numbers in hand.

## 4. Open decision — the one thing that blocks 6a

`tokens.css` currently states a deliberate, reasoned direction:

> the chrome is deliberately desaturated so the world's colours are the only
> saturated thing on screen. Every voxel builder surrounds a colourful world
> with more colour, and the result is mud.

The NEON DRIFT spec asks for the opposite: glassmorphic panels, cyan `#00fff5`
and magenta `#ff0080` on `#0a0a0f`, glow, scanlines, per-mode accent recolour.
Both are coherent; they are not compatible. This needs an explicit call before
6a, because it decides whether 6a is an extension or a re-theme.

**Decision (taken):** full neon re-theme. The spec's neon-on-dark glassmorphism
replaces the steel palette everywhere, the editor included. `tokens.css`'s
"desaturated chrome" rationale is superseded and its comment must be rewritten
rather than left contradicting the code. Per-mode accent recolour (build /
race / parkour) is part of the system, not a later addition.
