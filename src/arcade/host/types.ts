/**
 * The contract every arcade game implements.
 *
 * Deliberately four methods and no lifecycle beyond them. Adding game #5 is
 * one folder and one line in `registry.ts`; if a game needs the host to grow a
 * hook, the hook is almost always a thing that game should own itself.
 *
 * ── Why `step` and `render` are separate ─────────────────────────────────
 *
 * `step` runs on a fixed 1/60 timestep and is the only place state changes.
 * `render` draws and changes nothing. That split is what makes a game play
 * identically on a 60Hz laptop and a 144Hz monitor — see `loop.ts` — and it is
 * the same discipline the world's own `FrameLimiter` applies to R3F, for the
 * same reason.
 */

export interface InputState {
  /** Written by listeners, read once per step. Keyed by `KeyboardEvent.code`. */
  readonly keys: Record<string, boolean>;
  /** CSS pixels within the canvas, and whether a button or finger is down. */
  readonly pointer: { x: number; y: number; down: boolean };
  /** -1..1 on each axis, from the keyboard or a virtual stick. */
  readonly axis: { x: number; y: number };
  /**
   * Every pointer currently down, in CSS pixels within the canvas.
   *
   * `pointer` is one point, and two thumbs on one phone overwrite it: the
   * second finger's move lands on the first finger's position. A cabinet
   * with two sticks — the duel's two players on one screen — has to tell
   * fingers apart, and `id` is the browser's `pointerId`, stable for the
   * life of one touch. Order is arrival order. A touch that begins and ends
   * between two steps is still listed for one step, like `pointer` is.
   */
  readonly touches: readonly TouchPoint[];
}

export interface TouchPoint {
  readonly id: number;
  x: number;
  y: number;
}

export interface GameServices {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. `ctx` is already DPR-transformed, so draw in these. */
  width: number;
  height: number;
  input: InputState;
  /** Seeded. `Math.random` is banned in a game module — see `rng.ts`. */
  rng: () => number;
  /**
   * Play a named sound, optionally shifted by semitones.
   *
   * The shift is part of the contract rather than something a game works
   * around, because a pitch that climbs with a streak is the cheapest piece of
   * juice there is — five identical beeps and a rising phrase cost the same.
   */
  sfx: (name: string, semitones?: number) => void;
  /** Throttled by the host to ~10Hz. Never call this per frame. */
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
  /**
   * A board cabinet's result: the local player finished `place` of `of`.
   *
   * ── Why a placement is not a score ───────────────────────────────────
   *
   * `onGameOver` takes a number that a runner grows without limit, and
   * `lib/arcade-payout.ts` pays a rate per point on exactly that basis — it
   * says so itself: an endless runner has no best-possible score, so paying
   * per run is the only rule that leaves it worth playing twice. A Ludo match
   * has a top. Paid per point it would pay more for a *longer* match, which
   * rewards stalling in the one game whose main design risk is already that it
   * runs too long.
   *
   * Optional, so the three runners that predate this are untouched. The host
   * reads it and the payout route learns about placements in 8f — see
   * `plan-phase8.md` §2B and §4; until then a board cabinet earns nothing,
   * which is the right way round for a rate nobody has agreed yet.
   *
   * ── Fires when the *player* is placed, not when the match resolves ────
   *
   * Ludo carries on after first place to settle 2nd and 3rd. The run does not:
   * `onGameOver` puts up the result screen and can only fire once, so the run
   * ends when the local seat has a place. Playing out the remaining seats is a
   * thing to watch, not a thing to wait for. See §2D.
   */
  onPlaced?: (place: number, of: number) => void;
}

export interface ArcadeGame {
  /** Fixed timestep. `dt` is ALWAYS 1/60. Never draw here. */
  step(dt: number, s: GameServices): void;
  /** `alpha` is 0..1 between the last two sim steps. Never mutate here. */
  render(alpha: number, s: GameServices): void;
  /** Canvas size changed. Optional. */
  resize?(w: number, h: number): void;
  /**
   * Bring a finished run back to life, after a watched rewarded ad. Optional:
   * a cabinet without it is never offered a continue. Called only after
   * `onGameOver`; returns false if the run cannot be resumed after all. The
   * run keeps its score, so the host pays only what it adds (see GameHost).
   */
  revive?(): boolean;
  /** Release everything: images, audio nodes, physics engines, workers. */
  destroy(): void;
}

export interface GameModule {
  create(s: GameServices): Promise<ArcadeGame> | ArcadeGame;
  /** Awaited before the first step. Preload images and audio here. */
  preload?(): Promise<void>;
}
