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

### 6a — Design system — **done**
Extend `tokens.css` with the chosen accent system; add glass and neon surface
recipes to `globals.css` alongside the existing `.hud-panel`; add the display +
mono type pairing. Establish the shared screen-zone grid as one layout
component the three HUDs consume, so placement is defined once.
**Accept:** all three HUDs render through the zone grid; no HUD hard-codes a
corner; reduced-motion honoured; existing pages unchanged in structure.

### 6b — Controls: remapping + racing verbs — **done**
A `lib/keybinds.ts` store (persisted, with presets) that both control maps read
from, replacing the two hard-coded arrays. Then boost/nitro, drift/handbrake,
look-back, camera cycle, respawn on the bike, with the meter and speedometer in
`RaceHud`.
**Accept:** every desktop action is rebindable and survives reload; conflicts
are shown; speed and boost are on screen; `npm test` covers the bind resolver.

### 6c — Mobile control schemes — **done**
Thumb-zone layout at >=48px with ~8px spacing and haptics; the three racing
schemes (tilt / tap / assist) with assist as the default; contextual build and
parkour clusters; fly toggle and hotbar for build.
**Accept:** playable one-thumb-per-side on a phone; targets pass the 44x44
floor; scheme choice persists.

### 6d — Parkour mode — **done**
Checkpoints landed as a marker list on `WorldDoc` (see the note there for why
not a fifth `Shape`), with respawn to position *and* facing. The five maps are
`parkour.ts` (Tutorial) plus the four in `courses.ts`; `course-kit.ts` is the
shared geometry vocabulary and `jump-arc.ts` is the reach model they are all
built against. Restart is its own command — `requestRestart`, bound to T —
because with the checkpoint rule in place a respawn can no longer give you a
clean run, and a finished run now restarts on any respawn rather than
returning you to a checkpoint of an attempt that is over.
**Accept:** met. Dying returns you to the last checkpoint with the clock still
running; five maps exist at Tutorial..Expert, and `courses.test.ts` proves
every one of them can be finished and that no checkpoint soft-locks a run.

### 6e — Progression — **done**

Medals shipped first, and they are derived rather than hand-set:
`course-graph.ts` finds the cheapest route a map admits (walk edges at run
speed, jump edges at their airtime), the Author time is that floor times
`HUMAN`, and the ladder is multiples of it. `AUTHOR_MS` caches the five
answers and `medals.test.ts` recomputes them from the geometry, so editing a
course fails the build with the number to write instead of leaving a stale
target.

The honest caveat stands: `HUMAN` (1.3) has not been playtested. The times
cannot be *impossible* — they are anchored to a route the geometry admits —
but whether Gold is a fair ask is a guess until someone runs the maps. One
constant retunes all five.

**Runs, boards and ghosts** landed on top of that:

- `runs` (`drizzle/0001_lame_silhouette.sql`) is one row per (world, player)
  holding their best, keyed on that pair, with `runs_board_idx` on
  `(world_id, time_ms)` for the only query a page load makes. `world_id` is
  `text` and carries no foreign key, because the maps a board is actually for
  are the shipped courses and those are slugs generated from code with no row
  to point at.
- `POST /api/worlds/:id/runs` upserts in SQL with `setWhere` on the time, so
  two tabs finishing at once cannot let the slower one land last. It refuses
  anything under `floorMs` — the solver's route, which is a physical floor.
  That is not anti-cheat and does not pretend to be; it is what stops one
  `fetch` with a zero in it from ruining a board.
- `GET /api/worlds/:id/runs` returns the top N plus the caller's own row and
  rank, and never a ghost. `runs/ghost` serves the one replay actually watched.
- Ghosts are a fixed-rate fixed-point track (`lib/ghost.ts`, 10 Hz, capped at
  three minutes), recorded against the course's own clock so the replay and the
  timer cannot disagree, and read back with an index and a lerp.
  `GhostRunner` chases your own best first and falls back to the record.

Two things deliberately not built, and why:

- **Friends boards.** They need a social graph the app does not have — the
  same reason `BuildRoom.canEdit` has no collaborator model. Global and
  personal best are what can be built honestly today.
- **Run history.** One row per player rather than per attempt. A player
  grinding a map five hundred times should not write five hundred rows for a
  board that shows one of them, and nothing in the app asks to see the others.

**Accept:** met. A finished run posts, the panel shows the board with your own
rank appended when you are off the bottom of it, and a translucent runner is
on the course from the first attempt after anybody has set a time.

### 6f — Juice, then perf re-measure — **done**

`prefers-reduced-motion` had exactly one reading in CSS and one inline query
in `InstancedParts`. The WebGL side — which is where all the motion actually
is — had none, so the setting did nothing about the two effects it is most
obviously about. `lib/motion.ts` is now the one reader, and the rule it
documents is the one applied throughout: feedback that moves the camera or the
world is dropped, feedback local to the thing you touched is kept.

- **Hit-stop** (`FEEL.hitStop`, defined since Phase 1 and never used) is a
  `hold()` on the frame gate: the same elapsed value returned twice, which
  hands every `useFrame` — and Rapier's accumulator, which reads that same
  delta — a step of exactly zero while the frame is still drawn. One place
  rather than a flag sixty loops have to remember to check.
  `frame-cap.test.ts` covers the freeze, the ceiling and overlapping holds.
- **Screen shake** on a hard landing and on a bike impact, and a smaller kick
  when a boost lights so it reads as a shove rather than a number going up.
- **Impact, on the bike.** Worth calling out because it was a bug the juice
  work found rather than an effect: the body is driven by `setLinvel`, so a
  wall stopped it without the motion model ever hearing about it. `speed`
  stayed at 18 against a rail, the speedometer read 180 kph while the bike was
  motionless, and the only feedback for hitting a wall was that the scenery
  had stopped moving. The loop now compares where the bike got to against
  where it meant to go — confirmed over two frames, because Rapier's fixed
  timestep genuinely skips a step now and then — and believes the world.

**Perf, re-measured.** The overlay existed only on the race canvas, so the
five parkour courses — the largest part counts in the game — were the one
thing that could not be profiled. `PerfProbe`/`PerfPanel` now mount on the
Play and Arena canvases too.

Numbers, off the actual overlay (`?perf=1`):

| | draw calls | triangles | programs |
|---|---|---|---|
| Neon Run (Play) | 10 | 221,568 | 9 |
| Neon Circuit (race, grid up) | 60 | 1,609,476 | 8 |

Two readings of that, and one non-answer:

- The draw-call budget is not close to being a problem: 60 against a ceiling
  of ~100, and against the 10,000+ where the WebGPU figure §2C quotes comes
  from. **So the WebGPU swap stays deferred**, which is what §2C predicted —
  now with a number rather than an argument.
- Triangles are down from the 2.53M camera + 2.53M shadow recorded in
  `lib/quality.ts` to 1.6M total, so `blockDetail` and `groundCastsShadow` are
  holding.
- **fps and worst-frame from this run mean nothing.** It was taken headless on
  a software rasteriser at DPR 1. Draw calls, triangles, geometries and
  programs are device-independent and are the numbers the WebGPU decision
  rests on; the frame budget still has to be re-run on a real tier-3 phone,
  and now there is an overlay on every canvas to do it with.

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
