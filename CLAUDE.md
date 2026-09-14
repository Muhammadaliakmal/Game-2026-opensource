@AGENTS.md

# Blockworld

See `SPEC.md` for the full build plan. Work phase-by-phase. Never change pinned
dependency versions without checking in.

## Conventions

- Keep all `zustand` state **outside** the React render tree. Never use `useState`
  for editor part data.
- Do not run physics during editing — editor placement is integer-grid hash-map
  math only; Rapier runs in Play mode only.
- Store part color as a palette **index**, never a hex string.
- Never SSR the R3F canvas — always `dynamic(() => import(...), { ssr: false })`.
- Use tuples, not objects, for the `parts` payload.
- Render blocks via `InstancedMesh` (one per shape), not one mesh per block.
- React 19 / R3F v9 only. Never mix R3F v8 with React 19.
- Materials and geometries for procedural models go at **module scope**, not in
  a `useMemo`. `useMemo` is per component *instance*, so five bikes on a grid
  meant five copies of an identical material. Only genuinely per-instance
  values (a rider's colour) get a cache, and that cache is a module-level `Map`.
- Read a value that lives outside React with `useSyncExternalStore`, not
  `useEffect(() => setState(read()))`. The `react-hooks/set-state-in-effect`
  lint rule is on and will reject the latter.
- Do not assign to a property of something a hook returned — `camera.position.x
  += n` is a `react-hooks/immutability` error. Build the value and hand it over
  in one call (`camera.position.set(...)`, `.copy(...)`).
- A control inside a `<ThumbCluster>` must be pressable. The cluster is
  `pointer-events: none` so its gaps stay transparent to the world; `TouchButton`
  and `ThumbStack` opt back in themselves. Anything new that goes in a cluster
  has to do the same — the race's steering pads once did not, and were
  untappable on every phone while the assist quietly drove the bike.

## Responsive layout and the touch controls

Two invariants here span files and will break quietly if only one half is
edited.

**1. The control budget.** All touch-control geometry lives in `tokens.css`
("Touch control geometry") and nowhere else. The left and right thumb clusters
are `position: fixed` and cannot see each other, so the only thing stopping
them overlapping is that their sizes are budgeted against the viewport at each
breakpoint:

    left  = 2 × --steer-w + --touch-gap
    right = --touch-sm + --touch-gap + --touch-md + --touch-gap + --touch-lg
    used  = left + right + 2 × --touch-inset   →  must stay under the width

- `--touch-sm` is **48px at every breakpoint** and never scales. Apple HIG 44pt
  / Material 48dp / WCAG 2.5.5 AAA. Shrink the sizes above the floor and the
  gaps; never the floor.
- Adding a control to a cluster changes the arithmetic. Re-check the budget, or
  the `max-width` guard on `<ThumbCluster>` will wrap it instead.
- `useTouchScale()` in `lib/use-media-query.ts` restates the same scale as a
  number, because ecctrl's `Joystick` needs its drag radius as maths rather
  than as a length. **Its breakpoints must match tokens.css.**

**2. The reserved band.** `--controls-h` is how tall the controls stand, and
`HudZones` keeps its three bottom zones above it, which is what stops the
speedometer, the boost meter and the way out sitting under a thumb. It is only
non-zero when both are true:

- the media query `(pointer: coarse), (max-width: 900px)` in `tokens.css` — the
  CSS twin of `useTouchControls()`, keep them identical; and
- `MOUNTS_CONTROLS` in `HudZones.tsx` says this mode has controls at all. Race
  and parkour do. The builder and the arena do **not** — a mode that reserves a
  band it does not need floats its own bottom row over empty screen.

**Also:** `.text-display` is the fluid headline size, `.hud-panel--readout` is
the higher-contrast surface for a value read while riding (the sky runs a day
cycle, so ordinary glass goes white-on-pale at sunset — `backdrop-filter`
blurs what is behind a panel, it does not darken it), and chrome geometry
(`--chip-*`, `--icon*`, `--row-*`) is tokenised so the same kind of panel
cannot drift to three different paddings again.

`body:has([data-immersive]) .site-header` hides the site header on **every**
game screen now, not just the installed app. That is only safe while every
immersive screen carries its own exit — the arena had none outside its
end-of-match banner, and a match still being fought had no way out at all.

## Which way things face

There is one yaw convention and it is easy to get backwards. The look rig puts
the eye at `+(sin yaw, cos yaw)` from the character and then looks **back** down
that offset, so the direction a player sees along is the **negation** of it:

    forward = (-sin(yaw), -cos(yaw))

`yawTowards(dx, dz)` in `play/camera-rig.ts` is the authority. `FACING` in
`lib/course-kit.ts` is a copy of it — course-kit is pure and the headless room
server imports it, so it must not pull in three.js — and `facing.test.ts` pins
the two together and checks that no shipped checkpoint or spawn faces away from
what comes next. Never write a `Checkpoint.yaw` or a `WorldDoc.spawnYaw` by
hand; use `FACING`.

`WorldDoc.spawnYaw` is optional. A course states one and the player arrives
looking down it; a sandbox leaves it undefined and keeps whatever yaw the rig
was holding.

## Juice and `prefers-reduced-motion`

`lib/motion.ts` is the only reader of the setting outside `globals.css`. The
rule: feedback that moves the camera or the world (screen shake, hit-stop,
particle bursts) is dropped under reduced motion; feedback local to the thing
you touched (a button lighting, the block placement pop, haptics, sound) is
kept, shortened rather than removed where it is an animation.

Hit-stop is `gate.hold(seconds)` on the frame gate, asked for through
`requestHitStop`. It returns the same elapsed value for a few frames, which
hands every `useFrame` — and Rapier, which accumulates that same delta — a step
of exactly zero while the frame is still drawn. Do not add a per-loop "am I
frozen" flag; that is the thing this replaced.

## Runs, boards and ghosts

`runs` is **one row per (world, player)** holding their best, not one per
attempt. `world_id` is `text` with no foreign key, because the courses that
ship are slugs generated from code and have no row to point at.

- Submission upserts with `setWhere` on the time, so a slower concurrent write
  cannot land last. It refuses times under the course's route floor. That is a
  guard against a hand-written `fetch`, not anti-cheat, and the comment in
  `medals.ts` says so.
- The board endpoint never returns a ghost. Ghosts are the largest thing in the
  table and exactly one is ever watched; `runs/ghost` serves that one.
- Ghosts are fixed-rate (10 Hz) fixed-point tracks — see `lib/ghost.ts` — read
  back with an index and a lerp, and recorded against the course's own clock so
  the replay and the on-screen timer cannot drift apart.

### The course floor, and what an edit costs a board

**Nothing downstream of `authorMsFor` is keyed by an id.** The medal ladder is
multiples of one Author time, and that number has two sources: `AUTHOR_MS` for
a shipped slug, and `worlds.floor_ms` for a course somebody built.
`authorMsFor(id, floorMs)` is the only place they meet — everything past it
(`medalTimesFor`, `medalForAuthor`, `nextMedalFor`) takes the number. The
slug-keyed `medalTimes` / `medalFor` / `nextMedal` are thin wrappers kept for
`/parkour`, which genuinely does only list shipped courses.

**`floor_ms` is server-derived and must never come off the document.** The doc
is client-authored and both `PUT /api/worlds/:id` and the room's
`POST /api/worlds/:id/sync` accept one wholesale, so a floor stored inside it
would be a floor the client writes — which is the exact claim the floor exists
to check. It is computed from the document the server has just validated, and
**all three write paths do it**: those two plus `POST /api/worlds`, which is
create *and remix*.

**`courseKey` is a proof, not a cache key.** `surfaces()` in `course-graph.ts`
reads only `x`, `y`, `z` of each part — never shape, colour, finish or rotation,
and never props — so a hash over exactly those cells plus the spawn and goal
cells is a *proof* that the solver would return the same answer. Two things
follow, and both matter:

- The solver is ~30–90 ms on a shipped course, 279 ms on Island, and about two
  seconds at the 50,000-part cap. It cannot run on `POST /runs`, and it cannot
  run on every `sync` either — a room writes the whole document every five
  seconds while anyone is building. A fingerprint match skips it.
- **The board rule is one line: an edit that moves the floor resets the times,
  and every other edit leaves them alone.** A repaint, a rotation, a finish
  change, a prop drag and an idle autosave provably cannot move it. Both write
  paths return `boardReset` and delete the world's runs when `floorMoved` says
  so. Losing the goal counts as a move.

`cellOf` in `course-floor.ts` floors x and z and rounds y **because
`surfaceUnder` does**. If that derivation changes, this has to change with it —
`course-floor.test.ts` is what holds the two together.

Adding a column derived from the doc means adding a backfill too:
`npm run floors:backfill` (safe to re-run, `--all` to recompute everything).
Without one, every world that predates the column reads as "not a course" until
somebody happens to press Save on it.

## Level geometry

Anything a player has to jump between is built against `lib/jump-arc.ts`, and
never against a number in a comment. The arc is derived from `FEEL` — and it
is asymmetric, because `fallGravityScale` is 3, so the obvious `2v/g` airtime
is wrong by about 40%.

The unit is **empty cells between two platforms**, not centre-to-centre
distance: the character takes off at one leading edge and lands on the other,
so two pads three cells apart centre to centre have two cells of air between
them. `canClear(gap, rise)` is the predicate; `DESIGN_MARGIN` is the 20% that
separates a hard jump from a frame-perfect one, and Expert courses spend it
rather than the safety underneath it.

New courses go through `lib/course-kit.ts` (one part per cell, nothing below
y=0) and get added to `TIERED_COURSES`. `courses.test.ts` then walks the
surfaces as a graph and proves the goal is reachable, every checkpoint is on
the route, and — the one that matters — that the goal is still reachable *from
every checkpoint*, because a resume point you cannot continue from is a soft
lock rather than a mercy.

## Authoring a course in the editor

`goal` and `checkpoints` are the two fields that turn a world into a course,
and the `goal` / `checkpoint` tools (`X` and `C`) are how a player writes them.
Both go through the command bus as ops — `goal`, `cp-add`, `cp-remove` — so
undo reaches them and a build room replicates them.

- **`toDoc` is the round trip, and it is silent when it is wrong.** A field the
  store does not carry is a field `toDoc` cannot emit, and one it cannot emit
  is one that Save *and Play* delete: `WorldCanvas` builds the play snapshot
  from `toDoc`, not from the loaded document. That is how `checkpoints` and
  `spawnYaw` came to be stripped from every remix of a shipped course while
  `goal`, the field between them, was passed through. Anything added to
  `WorldDoc` must be added to the store, to `loadDoc` and to `toDoc` together.
- **Checkpoint ops carry an index, not just a value.** Order is the mechanic —
  `checkpoints.ts` reads "later in the course" straight off the array — so an
  undo has to put a gate back where it was, not on the end. They carry the
  value too, so a peer's stale index removes the gate the op names.
- **Empty means absent.** A world with no gates saves without the field rather
  than with `[]`; a sandbox should not have the shape of a course with none.
- **Marker height is `[x + 0.5, y, z + 0.5]` of the cell above the block**,
  which is the same thing `Course.checkpoint` and `goalOver` compute in
  `course-kit.ts` for the shipped courses. The two must agree or a hand-built
  course's markers sit half a block off from a generated one's.
- `CourseMarkers` draws them while building and **must not animate** — the
  editor canvas is `frameloop="demand"`. It shows each gate's index and a stub
  pointing the way a run resumes, because `yaw` is otherwise invisible until
  somebody falls.
- `X`, not `F`, opens the finish tool. `FrameWorld` owns `F` on its own window
  listener.

## The bike, and who is sitting on it

The race bike is an imported GLB (`public/bikes/scifi.glb`), not the procedural
one any more — but the procedural one is still there and still matters.

- `npm run bike:import` rebuilds the GLB from `assets/raw-bikes/BIke_Low.fbx`
  (gitignored, same rule as raw props and characters). It collapses **87 meshes
  and 19 Maya materials into 5 draw calls and 5 named materials**, decimates
  69,835 triangles to 20k, and normalises the model to `BikeModel`'s own
  convention: length along +Z, origin at axle height, tyres 0.43 below it.
  Those three facts are what make it a straight swap for the procedural bike
  and what keep the rider on the seat.
- **`body` and `accent` are load-bearing material names.** They are the two a
  rider's colour lands on (`paintFor` / `glowFor`); rename them in the importer
  and every bike on the grid comes out the same colour.
- `npm run bike:preview` rasterises the GLB to `docs/bike-preview.png` on the
  CPU — three orthographic views with a floor line. It exists because one
  question about an imported model cannot be answered any other way without a
  browser: **which end is the front.** `FRONT_IS_PLUS_X` in the importer is the
  one constant that flips it, and the glass canopy at z +0.68 plus the widest
  upper body (the handlebars) at z +0.4 are what say it is currently right.
- `VoxelBike` is the Suspense fallback, exactly as the courier is for `Avatar`.
  Both are built to `SADDLE` and `BARS`, so a GLB arriving mid-race does not
  move its rider.

### Riders

`Rider` is a chooser, the same shape as `Avatar`: the shop character you bought
if you bought one (`RiderRig`), the voxel courier otherwise (`VoxelRider`).
Rivals get theirs from `peer.character`, which is already on the wire.

- **The seated pose is `SEATED` in `play/character-rig.ts`, and it is checked
  rather than eyeballed.** `character-rig.test.ts` runs forward kinematics over
  each shipped GLB and asserts the hands arrive forward of the hips, the knees
  ahead of them and the feet below the knees. Joint angles are not readable by
  inspection; where the hands end up is.
- **`FACE_SIGN` applies to the walk and NOT to the ride.** The gait is authored
  in the courier's -Z-forward space and the GLBs face +Z, so the walk negates.
  The bike also faces +Z, so the riding pose is authored in the model's own
  space and negates nothing.
- **A tuck must not take the hands off the bars.** The shoulders are children of
  the chest, so folding the torso carries the arms with it; `poseSeated`
  subtracts the fold back out at the shoulder and adds it at the elbow. What is
  left is 45 mm of hand travel against 94 mm at the head, which is a hand
  sliding on the grip. The test holds that ratio.
- Lean and tuck constants live in `race/ride.ts` because there are two kinds of
  rider drawn by different code, for the same reason `gait.ts` exists.

## Race tracks

**Every race track shares one XZ footprint** — the rounded box in
`lib/race-track.ts` (`BX`, `BZ`, `CORNER`, `HALF_WIDTH`). That is the load-
bearing fact: `lapProgress`, `sectorAt`, `START_LINE_Z`, `GRID_SLOTS` and the
steering assist are all written against it, so the room server counts laps with
the same code whichever track is running and `race.test.ts` never has to know a
track exists. A track that changed the footprint would move all of that.

- `RACE_TRACKS` is the registry — id, world slug, name, blurb — and
  `raceTrackSlug()` is the validation step that stops a client naming an
  arbitrary world in a room option.
- The pick is a **create-time** room option, exactly like `target`: the lobby
  puts `?track=` on the link it opens, the server honours it on create and
  ignores it on join, so everyone racing a shared code races what its creator
  built.
- `circuit.ts` is flat by choice. `vapor-ridge.ts` is the elevated sibling.

### Elevation, on Vapor Ridge

Height is a **per-straight profile keyed on an along-axis coordinate**, never on
lap angle. Lap angle's iso-lines lean a few degrees inward down a straight (see
`race-assist.ts`), so driving elevation off it tilts every hill across the road
and leaves a lateral step down one edge. `regionOf()` splits the loop into the
four straights and the corners; each straight has its own `s` in cells and its
own `(s, level)` knot list in `HILLS`.

Three rules the generator holds, and `vapor-ridge.test.ts` pins:

- **Corners and the start straight are flat at level 0.** A ramp is a fixed
  one-cell 45° climb that only turns in 90° steps, so it cannot follow a curve —
  and the grid slots and start line carry hard-coded Y from the flat circuit.
- **A slope changes by at most one level per cell.** Anything steeper is a wall.
  The one exception is the drop off the crest, written as a knot pair a single
  cell apart, which `levelAlong` snaps across so no cell sits on the face.
- **A falling ramp sits at `level + 1`, a rising one at `level`.** A ramp block
  spans `[y, y+1]`; going down, its high edge has to meet the higher ground
  *behind* it, so it is one cell above the level it is heading for. Getting this
  wrong leaves a one-unit step at the top and bottom of every descent, which is
  what it did first.

## The sky

Play and Race run **night**: a dark-blue-to-black dome, a starfield, a moon and
fog the colour of the horizon. `NIGHT_LOOK` in `lib/atmosphere.ts` carries the
gradient and the fog together so they cannot be edited apart — the world-edge
seam appears the moment the fog colour and the horizon stop drift, and there is
only one value for both.

**The night is the background and nothing else. It does not light the world.**

That sentence took three attempts to arrive at, so it is worth stating as a
rule: `NIGHT_LOOK`'s light values are the editor's studio rig, value for value,
and both canvases keep the `RoomEnvironment` probe they have always had. The
moon is placed at 50° / 32°, which is exactly where `FollowSun`'s
`DEFAULT_OFFSET` already pointed, so the shadows fall where they always fell
*and* where the visible moon says they should.

The reason is not conservatism. Every course, every palette colour and the bike
were authored under that rig, so a different rig renders them as different
colours — and in a game whose entire subject is the colours somebody placed
block by block, that is the content, not the mood. A night scene on film works
the same way: the background tells you the time of day, the subject stays the
colour it is.

- The sunset (`SUNSET_LOOK`, `SunsetSky`) is still complete and still selected
  by `NEXT_PUBLIC_MAP_V2=1`. It *does* generate its environment from its own
  dome, which is the right call there — the reflections and the visible sky
  cannot drift apart because they are the same numbers.
- Build mode keeps the neutral studio background. A black sky is right for
  playing and wrong for judging a colour you are placing.
- The raw gradient data is in `lib/sky-stops.ts`, which imports nothing.
  `atmosphere.ts` re-exports it. Server components (the mode covers) read the
  stops from there — importing them from `atmosphere.ts` would pull the whole
  of three.js into the server bundle to render an SVG gradient.

### Three ways this went wrong, and the check that catches them

`npm run light:check` walks the same maths three does — hemisphere irradiance,
a Lambert key, the environment term for metals, then ACES and the sRGB transfer
— and prints the resolved hex for every finish and palette colour under each
look, with the editor's studio alongside. **Run it after touching any light
colour, intensity, `envIntensity` or moon angle.** It should read ~100%.

1. **Nearly all of a light's output is in its colour.** `hemiIntensity` went
   1.15 → 0.9, which reads as "a little dimmer", while the sky colour went
   #c8d2dd → #4a5da8 — about a sixth as much light once both are linear. The
   product was a *seventh* of the editor's fill. Everything not facing the moon
   went black.
2. **`metal` is lit by the environment and by nothing else.** metalness 1.0
   means the probe is the only contributor, and a night sky carries roughly a
   fiftieth of the light a grey room does. A probe generated from the night
   dome rendered every chrome rail on Neon Circuit pure black — which is what
   "the track is invisible" was. Hence RoomEnvironment, under every sky.
3. **The light must not repaint the world.** Correcting (1) with a strongly
   blue fill lit everything correctly and made all of it blue. The check prints
   the resolved hex beside the studio's precisely so a colour cast shows up as
   a number rather than as a feeling.

The bar is a **ratio, not a floor**: no surface may fall below 75% of what the
studio gives it. An absolute floor was tried first and was wrong — a metal rail
in indigo renders that dark under the studio too, so the test failed surfaces
that had never been brighter than that. A test the code has never passed is not
a test.

Two things about the sky layers that are easy to get wrong:

- **`renderOrder` only sorts within three's opaque and transparent groups.**
  The dome is opaque, so its `-1000` really does put it first. The stars and
  the moon are transparent, so they draw after *every* solid block whatever
  their order — which is why they depth-test against the world and the dome
  does not.
- The starfield's geometry, shaders and per-frame write all live in
  `star-field.ts`, not in the component. That is what the lint rules require:
  `react-hooks/purity` rejects `Math.random()` reached from render, and
  `react-hooks/immutability` rejects assigning to a member of a value a hook
  returned.

## The menu

There are two modes, and each is a cover you press, not a row with a button
after it: `/parkour` (the five-course ladder) and `/race`. Parkour first —
it works alone, offline, on the first visit; racing needs a room server and
somebody else, and leading with the one that can fail to connect is leading
with the one that can disappoint.

- Racing is deliberately **not** a chip in the page header any more.
- `PARKOUR_COURSES` / `SANDBOX_WORLDS` in `built-in-worlds.ts` split on `tier`,
  so adding a course to `TIERED_COURSES` puts it on the parkour screen and
  nowhere else. There is no second list to keep in step.
- Cover art is SVG generated from `NIGHT_STOPS` and `var(--color-accent)`,
  which `data-mode` has already rebound per mode — the same mechanism the HUDs
  recolour with. Not screenshots: those would be seven PNGs to re-capture every
  time a course or the sky changed, and silently wrong the rest of the time.

## Perf overlay

`?perf=1` on any live canvas — Play, Race and Arena all mount `PerfProbe` and
`PerfPanel`. Keep it that way: the reason the parkour courses went unprofiled
for a phase is that only the race had it, and "profile before optimising" is
not advice you can follow on a canvas with no instrument.

Read draw calls, triangles, geometries and programs — those are
device-independent. fps and worst-frame only mean something on the device you
actually care about.

## Load time, and where it actually goes

Measured 10 September 2026, because the standing advice for this app was to
Draco-compress the glTFs and convert textures to KTX2, and **all of `public/`
was 717 KB**. The largest single asset was the bike at 73 KB. That work would
have saved nothing, and knowing so is worth more than doing it. (Phase 9
added ~700 KB of block surface strips — the largest asset is now
`block_normal.jpg` at 399 KB — which is why they are JPEG and not the 2.4 MB
of PNG they started as. Still under the three.js chunk on its own.)

What the numbers actually are:

| Thing | Cost |
|---|---|
| Every asset in `public/` | 717 KB total |
| World build + colliders + occlusion, worst world (Vapor Ridge, 10,762 parts) | **81 ms** |
| The world doc a race sends over the socket | 22-29 KB gzipped |
| three.js chunk | 886 KB raw / 232 KB gz |
| **Rapier chunk** | **2,183 KB raw / 815 KB gz** |
| All built static JS | 5.5 MB raw |

So it is not the art, it is not the geometry, and it is not the CPU: it is
about 1.1 MB gzipped of JavaScript, and **the order it is fetched in**.

### The waterfall

Every canvas mounts through `next/dynamic` with `ssr: false`, which is correct
— an R3F tree cannot be server-rendered — and has one expensive consequence.
The component never renders on the server, so its chunk is not in the HTML.
Served markup for `/race/<code>` references about 880 KB of chunks and **none
of the three big ones**, so the download that matters starts last:

    html -> app js -> hydrate -> discover canvas chunk -> 1.1 MB gz -> wasm init -> join room

`<PrefetchCanvas kind="...">` is the fix, and it is mounted on the pages that
come *before* a canvas — `/`, `/browse`, `/parkour`, `/race`, `/arena`. On
idle it fires the same dynamic import the mount will fire later, so the bytes
are already in the HTTP cache by the time anyone presses play. Guarded by
`lib/prefetch.ts`: Data Saver means no, and so does anything slower than 4g.
Unknown means yes, because Safari reports nothing and that is most phones.

Two rules for it. The module specifiers in `LOADERS` must stay identical to
the ones the mounts import, or the bundler emits a second copy of three.js and
the prefetch downloads a megabyte for nothing. And it stays on an idle
callback: a prefetch that delays the page it was mounted on has made things
worse in exchange for making them better later.

### What is still slow, and is not this

- **The room server's cold start.** Render's free tier sleeps after 15 minutes
  and takes the better part of a minute to wake. Nothing in the bundle affects
  it, and for `/race/<code>` it dominates everything above. `RaceCanvas`
  already says so on the loading screen ("waking the grid") rather than
  spinning silently. The fix is an uptime monitor, not code — see the Render
  section.
- **A direct `/race/<code>` link**, which has no earlier page to prefetch from.
- **Rapier's 815 KB.** `rapier3d-compat` base64-inlines its wasm, so the bytes
  are ~33% larger than the binary and are decoded on the main thread. Not
  addressed; it would mean leaving `@react-three/rapier`'s default loader.

Before optimising anything here again, measure it. The instrument for the
frame is `?perf=1`; the instrument for the load is the served HTML — read
which chunks it references, and in what order they can possibly arrive.

## Blocks that are never drawn

`lib/occlusion.ts` drops every part sealed in on all six sides before
`InstancedParts` buckets it. Three things to know before touching it:

- **Only a full cube (shape 0) may hide anything.** A slab is half height and
  a ramp and a wedge are cut away on the diagonal, so each leaves an opening
  its neighbour is visible through. *Any* shape may itself be hidden, because
  each fits inside the cell. Getting that asymmetry backwards puts a hole in a
  hillside.
- **It is not a quality setting.** There is no version of the picture where a
  sealed block is visible, so it is on at every tier and has no field in
  `quality.ts`. `occlusion.test.ts` proves the claim rather than asserting it:
  it enumerates every visible face of every built-in world with culling off and
  on and requires the two sets to be identical.
- **The index is a padded byte grid, not a hash.** Six neighbours are six fixed
  offsets in a flat `Uint8Array`, which is why it costs about a millisecond
  where six Map lookups per part cost five. It is rebuilt on `dirtyTick`, so
  outside the editor it runs once per world load. Past `MAX_GRID_CELLS` it
  declines to build one and culls nothing — a world that spread out is all
  surface anyway.

What it is worth, by world: Island 45% of its parts (1.73M triangles to 0.95M),
Vapor Ridge 8.7%, Neon Circuit nothing at all — it is flat, and a flat world has
no interior. That spread is the reason it is a fact about the world rather than
a knob about the device.

## Block surfaces

A part's eighth field is a **surface** — an index into `TEXTURES` in
`lib/texture-list.ts` — and it is optional, so every seven-number tuple, every
shipped course and every op from an older build stays valid. Read it with
`textureOf(part)`, never `p[7]`. See `plan-phase9.md` for the spec this came
from and what was decided against it.

```
Renderer:        react-three-fiber (three r185, WebGL2 only)
Colour space:    sRGB output, ACESFilmic, exposure 1.05 — unchanged, see "The sky"
Surface maps:    two DataArrayTextures, 256² per layer, 4:4:4 JPEG on the wire
Voxel texturing: world-space triplanar, surface index as an instance attribute
Budget:          ~5.5 MB VRAM for the whole set; zero extra draw calls
Anisotropy:      8 high / 4 medium / 1 low, clamped to the GPU
```

Four things about it that are not obvious from the code:

- **Surfaces are tint maps, not colour maps.** The palette colour a player
  placed is the content (see "The sky"), so a surface supplies luminance,
  normal and roughness only, each normalised so 0.5 is the identity, and the
  shader doubles them. Layer 0, `plain`, is a flat 128: a block with no
  surface renders bit-for-bit as it did before surfaces existed. Grass in
  blue is blue grass, on purpose.
- **`TEXTURES` is append-only.** The index is stored in every saved world.
  Reorder or delete an entry and every world that used the slots after it is
  silently retextured. Retire a surface by keeping its name and changing its
  `source`. `texture-list.test.ts` holds the committed strip to the list, so
  a strip from a stale build fails the suite rather than the player.
- **The surface is an instance attribute, not a bucket axis.** Buckets are
  still `(shape, finish, ground, chunk)`; `aTexture` rides on each bucket's
  own clone of the shape geometry (`lib/textures/instance-texture.ts`). Making
  it a bucket axis would have multiplied the draw-call count by eleven.
- **The projection is by world position**, one tile per unit, because the
  four shapes share no UV layout and the wedge has none at all. A floor of
  one surface therefore tiles continuously across cells. `TEXTURE_SCALE` and
  the rest of the numbers are in `lib/textures/tuning.ts`.

The pipeline: `npm run textures:fetch` downloads the 1K CC0 maps from Poly
Haven into `assets/raw-textures/` (gitignored, like every raw asset) and
writes `public/textures/CREDITS.md`; `npm run textures` builds the strips in
`public/textures/generated/`, which **are committed** so a deploy needs
neither the network nor the raw maps. Judge any change to either at
`/dev/surfaces` — every surface under every finish in three palette colours,
with Play's post chain — and not on whichever block is in front of the camera.
`?cam=x,y,z&at=x,y,z` fixes the viewpoint so two builds can be compared.

Two things the post chain (`PostFX`, Play and Race only) changed elsewhere:

- `gl.info` resets on every `renderer.render()`, and a composer makes one per
  pass, so `?perf=1` would read the final full-screen triangle and report a
  10,000-block world as one draw call. `PostFX` turns the auto-reset off and
  snapshots the frame's totals after its own pass; `PerfProbe` reads those
  when they exist. Anything else that adds a render pass has to do the same.
- The frame monitor (`monitorFrame` in `quality.ts`) lowers a **guessed**
  tier by one step after sixty slow frames, session-only. It never touches a
  tier the player chose in settings.

### Graphics settings

Settings → Display → Graphics is where the tier override finally surfaces
(it had been in `quality.ts` since the tiers were measured, called by
nothing), plus four switches laid over it: Surfaces (Off / Simple / Full),
Effects, Shadows and Render scale. `useRenderQuality` resolves them in one
place — tier → auto ceiling → `GraphicsPrefs` — so a canvas never reads a
preference directly. Two rules:

- **Every row has an Auto that names what it resolves to**, read from
  `tierDefaults()`, so a choice is made against a known value. Pick "Low" and
  every other Auto re-labels to Low's defaults in the same render.
- **Preferences are per feature, not a second preset.** The usual complaint
  is about one thing — the glow, the stutter — and one switch is the honest
  fix. `render_prefs_v1` holds only the keys the player set; absent means the
  tier. `render_tier_v1` is untouched so nobody's existing choice is lost.

`shadowMap: 0` now genuinely means off — `FollowSun` reads it as
`castShadow`, where before it sized a real shadow map to zero pixels.

### What the shader costs

`triSample` branches on the blend weight, and `triWeights` snaps anything
under `TRI_EPS` to exactly zero, so a pixel on a flat face pays **one** fetch
per map rather than three; only the chamfers pay for two or three. The
branches are coherent per face and free. The mip level goes in explicitly via
`textureGrad` from one pair of `dFdx`/`dFdy` on the world position — a fetch
inside a branch has undefined derivatives where a quad diverges, which is a
sparkle along every block edge on some GPUs. The detail pass is skipped
entirely past `DETAIL.fadeEnd`, which is most of any world.

## Frame rate

Every continuously-animating canvas runs `frameloop="never"` with a
`<FrameLimiter fps={60} />` as its first child. **Never use `"always"`** — that
renders once per `requestAnimationFrame`, so a 120Hz phone does twice the GPU
work for frames the game does not use, gets hot, and then throttles to below 60.

Three things about this are easy to get wrong:

- `"demand"` is not a cap. Anything calling `invalidate()` renders at the
  panel's rate again. `"never"` is a hard cap because R3F's `invalidate()`
  returns early in that mode, so nothing can render except our `advance()`.
- **`advance()` takes SECONDS in `"never"` mode**, not milliseconds — R3F
  assigns the value straight to `clock.elapsedTime`. `advance(performance.now())`
  hands the first frame a delta of about a million seconds.
- The `frameloop` prop on `<Canvas>` owns the mode; `FrameLimiter` only drives
  it. Do not set it from both — `WorldCanvas` switches between `"never"` while
  playing and `"demand"` while building, and two writers make the mode after a
  transition depend on effect ordering.

Editing stays on `"demand"` (an idle editor should render nothing), so
`FrameLimiter` mounts only when playing. The scheduling itself is
`lib/frame-cap.ts` — pure, and tested to produce exactly 60 on 60/75/90/120/
144/165/240Hz panels.

## Installing (PWA and the Android APK)

`app/manifest.ts`, `public/sw.js` and `public/icons/*` make the app installable;
`/download` is the page that offers it. Regenerate icons with
`npm run icons:generate` — do not hand-edit them.

The service worker is an **allowlist**, and must stay one. It caches only
`/_next/static/`, `/icons/` and `/props/`. Never cache navigations: Clerk
renders session state into the HTML, so a cached page has somebody's sign-in
state baked into it.

The APK is not built here — it is generated from the deployed site by
PWABuilder. See `docs/ANDROID.md`, particularly the part about `assetlinks.json`
(without it the app runs with a browser address bar pinned over the HUD).

## Env

Secrets live in `.env.local` (gitignored): Clerk keys via `clerk env pull`,
Neon `DATABASE_URL` via `neon env pull`.

## Commands

- `npm run dev` — dev server
- `npm test` — unit tests (node:test via tsx)
- `npm run textures:fetch` / `npm run textures` — block surfaces, see "Block surfaces"
- `npx drizzle-kit generate` / `npx drizzle-kit migrate` — schema migrations

## Room server (`server/`, Phase 5)

A separate Node process — Colyseus 0.18 + `@colyseus/schema` 5. It imports the
app's `src/lib/ops.ts` through a `@/*` path mapping rather than duplicating it,
which is why `keyOf` lives in `lib/cell-key.ts`: everything else in `lib/grid.ts`
pulls in three.js, and a headless server must not.

- `cd server && npm run dev` — room server on :2567 (`npm test` for its tests)
- See `server/.env.example` for everything it reads.

### Measuring a room

Two things about a room can only be measured against a running one, and both
have a command rather than a procedure.

- `npm run peers:soak` (repo root) puts four real clients in one room over the
  real protocol and reports the distribution of **inter-arrival gaps** against
  `INTERP_DELAY`. That is the "no snapping" half of Phase 5's last acceptance
  row: a peer snaps when its next transform arrives more than 120 ms after the
  last, because `lib/net/peers.ts` deliberately renders that far in the past so
  it always has two known samples to walk between. `--url` points it at a
  deployed server, which is the only run that means anything — the number that
  matters is the one the host produces, not localhost's.
  - **Arrivals are quantised to `BuildRoom.patchRate`, so they cannot match
    `SEND_INTERVAL`.** 83 ms sends on a 50 ms grid arrive as a mix of 50 ms and
    100 ms gaps, averaging 89 ms — about 20 ms of headroom under the budget,
    not the 37 ms the two constants suggest. `--send` exists to demonstrate
    that rather than argue it: 50 ms is clean, 100 ms breaks the budget 13% of
    the time. If peers look jerky in production, measure this before touching
    the interpolator.
  - Bots must move. Colyseus patches only fields that changed, so stationary
    bots emit nothing and a harness built on them measures an empty room and
    calls it perfect. `x` doubles as the send clock — see the file.
- `cd server && npm run token` lists users; `-- --user <id>` mints a **real**
  Clerk session token via the Backend API. `verifyJoin` cannot tell it from a
  browser's, so it is how the owner-edits-their-own-world path gets tested
  without a browser. It creates a real session on a real account: revoke it.

### Who may do what in a room (5d)

Two separate questions, answered in two different places, and conflating them
is the mistake to avoid:

- **Who are you** — `server/src/auth.ts`. A Clerk session token, verified with
  `CLERK_SECRET_KEY`. No token is a *guest*: they join, they appear, they race,
  and they cannot change anything anybody owns. `ALLOW_ANONYMOUS_ROOMS=1` is
  the local escape hatch that makes everyone an editor; nothing else fails open.
- **What may you do here** — `BuildRoom.canEdit`. The world's owner, and nobody
  else: there is no collaborator model in the data, so anything more generous
  would be inventing permissions the app cannot grant or revoke. Built-in worlds
  have no owner and no row to save into, so nobody edits those either.

`BuildRoom` uses the **instance** `onAuth`, not the static one — Colyseus
honours only one, and the ownership check needs the world, which does not exist
until `onCreate` has run.

### Saving (5d)

The room is authoritative once anyone joins, so the room is what saves. It has
no Neon credentials: it writes through `POST /api/worlds/:id/sync`, which is
guarded by `MULTIPLAYER_SECRET` and is invisible without it. Timing lives in
`server/src/persist.ts` — 5 s after the last edit, a 30 s ceiling so continuous
building still lands, and once more on dispose.

### Running anything multiplayer locally

Build rooms, matches and races are all no-ops until the app is pointed at a
room server, which is the default — so `/race/ABC234` will tell you it cannot
connect rather than opening a grid. Three things, all of them required:

1. `server/.env` (copy `server/.env.example`) with either `CLERK_SECRET_KEY`
   — the app's own — or `ALLOW_ANONYMOUS_ROOMS=1`. With neither, every join is
   refused with a 501.
2. `cd server && npm run dev`.
3. `NEXT_PUBLIC_MULTIPLAYER_URL=ws://localhost:2567` in `.env.local`, then
   restart `next dev` — it is a `NEXT_PUBLIC_` var, so it is read at build
   time and a running dev server will not pick it up.

To have local sessions actually save, add the same `MULTIPLAYER_SECRET` to both
`server/.env` and `.env.local`. Without it the room runs read-only against
public worlds: `/api/worlds/:id/sync` refuses it, so private worlds 404 on join
and no edit is ever written back.

### Deploying the room server

Vercel cannot host it: a room has to stay resident and a serverless function
does not. It needs somewhere that runs a persistent Node process with
WebSockets.

**Live as of 2026-09-09.** The app is on Vercel at `https://specdrivengames.com`
(Vercel project `blockyard`, DNS at Namecheap; `www` is a 308 to the apex). The
room server is the Render Blueprint below, at
`wss://blockworld-rooms.onrender.com`. Three values are the whole coupling
between them, and each one is silent when wrong: the app's
`NEXT_PUBLIC_MULTIPLAYER_URL` is the room server's address, the server's
`APP_URL` is the app's, and `MULTIPLAYER_SECRET` is the same string on both.

Two things constrain the deploy, both easy to get wrong:

- **Deploy from the repo root, not from `server/`.** The server imports
  `@/lib/race-track`, `@/lib/ops` and `@/lib/worlddoc` at *runtime* through the
  `@/*` -> `../src/*` mapping in `server/tsconfig.json`. `server/` on its own
  does not run.
- **`tsx` is a runtime dependency**, because `npm start` is `tsx src/index.ts`.
  It lives in `dependencies` for that reason; do not move it back.

Environment on the host:

- `PORT` — usually set by the platform; `index.ts` already reads it.
- `APP_URL` — the deployed Next app. The room reads and writes worlds through
  its `/api/worlds/:id/sync`, so this must be reachable from the server.
- `CLERK_SECRET_KEY` — the app's own key. The room verifies join tokens with
  it. Leave `ALLOW_ANONYMOUS_ROOMS` unset in any real deployment: it makes
  every client an editor of every world.
- `MULTIPLAYER_SECRET` — the same value as the app's. Rooms now write worlds
  back, and this is the only credential that lets them; without it a deployed
  room silently discards every session's edits.

Then point the app at it: `NEXT_PUBLIC_MULTIPLAYER_URL=wss://<host>` (note
`wss`, not `ws`, from an HTTPS page) and redeploy the app — build-time var.

### Fly.io

`server/Dockerfile` and `server/fly.toml` are checked in for this. The image
installs only `server/`'s own dependencies — every `@/lib/*` import the server
makes touches exactly one npm package (`zod`), already in `server/package.json`
— and copies `src/lib` alongside it, nothing else from the app.

The Docker build context has to be the **repo root**, not `server/`: Docker
cannot `COPY` across a build context boundary, and `src/lib` sits outside
`server/` on disk. That is also why the deploy command below is run from the
repo root rather than `cd server && fly deploy`.

```
fly auth login
fly apps create <your-unique-name>          # then set that name as `app` in server/fly.toml
fly deploy --config server/fly.toml --dockerfile server/Dockerfile .
fly secrets set --config server/fly.toml   APP_URL=https://specdrivengames.com   CLERK_SECRET_KEY=sk_...   MULTIPLAYER_SECRET=...
```

`fly.toml` pins `min_machines_running = 1` and `auto_stop_machines = "off"`
deliberately: a room holds live `WorldSession` state and open sockets in
memory, and Fly's default scale-to-zero behaviour for stateless web services
is exactly how you drop every connected session without warning.

### Render.com

A free tier that sleeps after 15 minutes with nobody connected (the next join
eats a 30-60 s cold start while it wakes). `render.yaml` at the repo root is a
Blueprint: **New + -> Blueprint**, point it at this repo, and Render finds the
file.

**It must be created as a Blueprint, not as a Web Service.** Render only reads
`render.yaml` in the Blueprint flow. Created as a Web Service it ignores the
file entirely, auto-detects the root `package.json`, runs `npm install; npm run
build` — which is `next build`, the app, not this server — and dies on a
missing `DATABASE_URL`. The tell is the build log: it should say it is building
from `server/Dockerfile`, never `npm run build`. It reuses `server/Dockerfile` unchanged — `dockerContext: .` is the field
that makes the build context the repo root rather than `server/`, for the same
reason Fly's deploy command runs from the root.

Render prompts for `APP_URL`, `CLERK_SECRET_KEY` and `MULTIPLAYER_SECRET`
during the Blueprint setup wizard (they're `sync: false` in the file, which
means "not in git, ask the person deploying" rather than "optional").

To dodge the sleep: point a free uptime monitor (UptimeRobot, cron-job.org) at
the root URL every 5-10 minutes. The server already answers `GET /` with a
default 200 — nothing to add for this to work — and a monitored service that
never goes idle never sleeps.
