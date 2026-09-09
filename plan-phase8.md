# Phase 8 — Board games in the arcade: one turn-based layer, Ludo and Snakes on top

Source: the Blockworld Board Arcade spec (M. Ali Akmal). This document is that
spec read against the code that already exists, which moves a good deal of it
from "to build" to "built", and moves five things from "obvious" to "wrong
here".

**Decided before writing:** the engine extends `src/arcade/`, it does not
become a second `src/game/`. §10 (streaks, levels, cosmetic unlocks) is
deferred — see §2E. §11 arrived truncated and is out of scope.

## 0. What already exists, and is most of the spec's §2–§3

The spec proposes an engine: a loop, a seeded RNG, a registry, a canvas
painter, an audio bus, a save format, and a rule that the simulation stays out
of React. All seven are here, shipped, and already carrying two games.

| Spec asks for | Status |
|---|---|
| §3.2 one rAF loop, fixed timestep, accumulator | **Done, and stricter.** `host/loop.ts`. The spec has one clamp; this has two — `MAX_FRAME` for the backgrounded tab and `MAX_STEPS` for the machine that cannot keep up. The second is the one the spec is missing, and without it a slow phone spirals. `loop.test.ts` pins identical step counts at 60/90/144/240 Hz. |
| §3.4 seeded mulberry32, seed stored on the run | **Done.** `host/rng.ts`, and `Math.random` is already banned in a game module by convention. The seed already lives on the store and a run is already replayable from it. |
| §3.1 match state outside React, throttled snapshot | **Done.** `store.ts` says so in its own doc comment; `GameHost` pushes score at 10 Hz and nothing else crosses per frame. |
| §3.5 teardown written with setup | **Done, and harder than the spec asks.** `GameHost`'s single effect covers the async gap: a module that finishes `create()` after the run was abandoned is destroyed on the spot. |
| §2 folder layout, engine free of React | **Done, as a per-game convention.** `games/tower-stack/` is `tuning.ts` / `sim.ts` / `render.ts` / `index.ts`, with `sim.test.ts` running headless under `node:test`. That is the spec's split, already load-bearing. |
| Registry, lazy | **Done.** `registry.ts`, dynamic import per cabinet, one row to add a game. |
| §8.7 audio, one graph, one mute, varied repeats | **Done.** `host/audio.ts` synthesises rather than samples, so the spec's `playbackRate` jitter is a `semitones` argument instead. Everything hangs off the app master gain, so the site mute already silences it. |
| Per-cabinet music | **Done.** `host/music.ts`, seeded, `bpm` per registry row. |
| §0 versioned `localStorage` save | **Done.** `persistence.ts`, `blockworld.arcade.v1`, defensive field-by-field load. |
| Coins | **Done, and stronger than spec.** The payout is server-computed (`api/arcade/payout` + `lib/arcade-payout.ts`) with a soft and a hard daily cap. The spec treats coins as a client concern; a client-held balance was already rejected here for the reason `db/schema.ts` gives. |
| §8.5 tap input with edges | **Done.** `host/input.ts` distinguishes held from pressed and clears an edge after exactly one step, which is precisely what "tap a token" needs. |
| §8.4 pause / restart / quit chrome, touch-vs-keys hint | **Done.** `ArcadeOverlay.tsx`, and `ControlsHint` already answers the `(pointer: coarse)` question the spec raises in §8.4. |
| §8.7 reduced motion | **Done as a repo rule.** `lib/motion.ts` is the only reader outside `globals.css`, and CLAUDE.md already fixes which feedback is dropped and which is merely shortened. |

So the honest size of "board games in the arcade" is **not an engine**. It is a
turn-based layer over a host that is currently single-seat, plus two rules
modules and a bot.

## 1. What is genuinely missing

- **`GameServices` has one seat and one number.** `onScore(n)` and
  `onGameOver(finalScore)` describe a runner. Ludo has four seats, a phase, and
  a finishing order. Nothing in the host can express "seat 2 came third".
- **No phase machine.** Spec §3.3. Every existing game is a continuous
  simulation with no notion of whose turn it is.
- **No bots.** Spec §7, and the piece that decides whether any of this is worth
  shipping — a four-seat lobby with one human in it is not a game.
- **No board renderer.** Spec §4's path-graph painter, token stacking, and the
  cell-by-cell hop.
- **No dice.** Spec §8.6 item 1, which is the emotional centre and the single
  place most of the feel budget should go.
- **No turn timer, no lobby, no emotes.**
- **No `RulesModule` contract.** Spec §4. This is the thing that makes game #3
  a config file, and it is the one genuinely new abstraction in the phase.

## 2. Five places the obvious plan is wrong *for this codebase*

**A. Do not build `src/game/`.** It would duplicate `loop.ts` and `rng.ts` —
and duplicate them *worse*, since the spec's loop lacks `MAX_STEPS`. Two loops
in one repo is also the exact failure `ArcadeOverlay` documents avoiding for
the 3D world: two render loops running at once. The spec's real requirement is
not a second folder, it is that the *rules* import nothing from React or Next,
so they can run under `node:test` today and on a server later.
`games/tower-stack/sim.ts` already meets that bar without a separate tree, and
the rules modules will sit beside it under the same rule.

**B. A board game has a top, so it must not be paid per point.**
`lib/arcade-payout.ts` states its own reasoning plainly: an endless runner has
no best-possible score, so a difference-based payout is impossible and paying
per run is the only rule that leaves it worth playing twice — *"which makes the
arcade farmable by construction"*, bounded only by the daily caps.

Ludo is not that game. A match has a fixed ceiling: you place first, or you do
not. Paying `score × rate` would mean a longer match pays more, which rewards
stalling — the worst possible incentive in a game whose main design risk is
already that it runs too long. Board cabinets should pay a **flat amount per
placement**, which puts them closer to `lib/coins.ts`'s course rule than to the
runner rule. That is a change to the payout route, not just a new row in
`RATES`, and it is the one server-side piece of this phase.

**C. Bot think-time must be counted in steps, not milliseconds.** Spec §7 wants
400–1400 ms of deliberation, which reads as `setTimeout`. It cannot be one.
`GameHost` stops the loop on `visibilitychange`, on pause, and on the death
screen — a timer keeps running through all three, so a backgrounded tab would
come back with moves already made and no animation played, and a paused game
would quietly advance. Counting fixed steps means the bot freezes exactly when
the game does, for free, with no code that has to know what "paused" means.

`tower-stack`'s `deathFreeze` is the established shape for this: a step
counter, decremented in `step`, not a wall-clock deadline. Hit-stop on a
capture (§8.6 item 3) takes the same shape. Note that the world's `gate.hold()`
is **not** available here — that is the R3F frame gate, and the arcade canvas
loop is a different loop.

The same argument applies to the spec's 15-second turn timer.

**D. The run ends when the human is placed, not when the match resolves.**
`onGameOver(final)` fires once and puts up the death screen. Spec §5 wants the
match to continue for 2nd and 3rd place after somebody wins. Those two cannot
both be true of one call. The resolution: the *run* ends when the local player
finishes, whatever the remaining bots are doing; the result screen shows the
placement earned. "Play out all places" then becomes a spectate-after-finish
option rather than the default — and §5 already defaults `endOnFirstWin` on, so
this costs nothing.

**E. §10 is deferred, and the deferral is not a gap to close later.**
`plan-phase7.md` §2A ruled out XP, levels and daily goals with reasoning that
still holds: a medal is a better unit than a number that only goes up, and an
earned cosmetic turns a palette into a progression gate. The spec's §10 is
account-wide by design — streaks and levels "shared across every game" — so it
cannot be adopted for the arcade alone without reversing §2A for the whole app.
That is a real decision and it is not this phase's.

The **daily challenge** (§10, one fixed seed shared by every player that day) is
the exception and should ship: it is already free here, because
`useArcade.open(id, seed)` takes a seed and the RNG is already deterministic.

## 3. Sequence

### 8a — The turn-based layer — **done**

`host/rules.ts` holds the `RulesModule<S, M>` contract and imports nothing;
`host/turn.ts` holds the phase machine; `host/types.ts` gains `onPlaced?`. The
three runners are untouched. 12 tests, no DOM.

**Seven phases, not the spec's eight.** `resolvingCapture` is folded into
`animating`. A capture is not a state the *rules* can be in — `applyMove` has
already decided it happened and said so in an event — it is a thing the
animator is midway through drawing, and the animator already owns how long
that takes. Kept as a phase it would have forced the machine to know which
games have captures.

**Two tests earn their keep beyond coverage.** "a seat cannot roll twice"
asserts `requestRoll()` is refused at *every* moment between the press and the
turn ending, including the gap between an animation finishing and the turn
advancing — which is precisely where the `hasRolled`-boolean version leaks a
second roll. "does not hang doing it" pins the bounded loop in `advance()`:
near the end of a Ludo match every remaining seat can already be placed before
`isTerminal` has been asked, so the natural `while (true)` search for the next
player hangs the tab on the final turn.

**Moves are fully specified.** `{ tokenId, from, to }`, never `tokenId`, so
`applyMove` needs no side channel to recall what the dice said — which is what
lets a move list be replayed on its own by a server, or by a bug report.

### 8b — The board renderer and the dice — **done**

`host/anim.ts` (drawn positions, hops, hit-stop, cues) and `host/board.ts`
(graph, transform, hit-testing, token, die). 17 further tests.

**What is shared is the graph, not the picture.** Ludo is a cross and Snakes is
a ten-by-ten grid, and no drawing routine produces both. What they share is
narrower: cells with positions, a transform fitting them to whatever rectangle
the canvas is this frame, the inverse of it so a tap finds a cell, a stacking
rule, and one implementation each of a token and a die. A game's own furniture
is drawn by the game, inside that transform. A painter with `drawLadder` on it
would be a shared module both games have to edit.

**`layout` and `cellAt` are one transform written twice, so they are tested
against each other.** When they disagree the board draws perfectly and cannot
be tapped, which is a bug nobody can describe. The test round-trips every cell
through both at three viewport shapes.

**The animator is the only thing that knows where a token is drawn.**
`applyMove` moves a token from 3 to 9 instantly, because that is what a rule
is; read by the renderer directly it would arrive before the dice had settled
and the six cells between would never be seen. Rules emit events, the animator
consumes them, `turn.ts` waits on `busy`.

**Found while writing it: a job that takes its origin from the live view
object aliases the thing it writes on the next line**, so the token chases its
own start point and creeps instead of travelling. Invisible until something
animates from where it already is. `anim.test.ts` has a case that asserts a
capture is strictly between its endpoints halfway through.

**Sound comes out as cues, not calls.** The animator plays nothing; it appends
to a list the game drains into `sfx`. One reason: a module that reached into
WebAudio could not run under `node:test`, and the hop chain is pure timing,
which is exactly what is worth pinning. Hop cues climb a semitone per cell, so
a six is audible as a six.

**Reduced motion follows CLAUDE.md's rule rather than inventing a second one.**
Hit-stop and shake move the frame and are dropped; the hop is local to the
piece you are watching and is halved, not removed — a teleport deletes the
count of cells the hop exists to show.

**Colour is never the only signal.** Four seat colours, four token shapes,
always on rather than behind a setting somebody has to find. Red-against-green
is the exact pair Ludo is built on.

### 8c — Ludo
`games/ludo/` as `board.ts` / `rules.ts` / `render.ts` / `tuning.ts` /
`index.ts`. Quick Ludo as the default mode — §5's own note that a 12–20 minute
match is wrong for a browser arcade is correct, and matters more than the
variants list.

### 8d — Bots
`host/bots.ts`: step-counted think time, `scoreMove` per rules module,
difficulty tiers, name pool. Honest one-line disclosure in the lobby.

### 8e — Snakes & Ladders, with power cards
Cheap once 8a–8b exist. Ships the decision layer §6 correctly argues for.

### 8f — Payout, per §2B
Flat per-placement, server-side. Touches `lib/arcade-payout.ts` and the route.

## 4. Open decisions

- **Where a board cabinet lives in the world.** The existing cabinets are
  objects a player walks up to. Four seats and a 15-second turn timer is a
  much longer commitment than a runner; whether Ludo is a cabinet or its own
  route is unresolved.
- **Flat placement payout values.** §2B fixes the shape, not the numbers.
- **Whether the daily challenge ships in this phase or waits on §2E.** It is
  technically free; it is also the thin end of that wedge.
