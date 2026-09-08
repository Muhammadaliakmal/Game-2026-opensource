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
}

export interface GameServices {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. `ctx` is already DPR-transformed, so draw in these. */
  width: number;
  height: number;
  input: InputState;
  /** Seeded. `Math.random` is banned in a game module — see `rng.ts`. */
  rng: () => number;
  sfx: (name: string) => void;
  /** Throttled by the host to ~10Hz. Never call this per frame. */
  onScore: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}

export interface ArcadeGame {
  /** Fixed timestep. `dt` is ALWAYS 1/60. Never draw here. */
  step(dt: number, s: GameServices): void;
  /** `alpha` is 0..1 between the last two sim steps. Never mutate here. */
  render(alpha: number, s: GameServices): void;
  /** Canvas size changed. Optional. */
  resize?(w: number, h: number): void;
  /** Release everything: images, audio nodes, physics engines, workers. */
  destroy(): void;
}

export interface GameModule {
  create(s: GameServices): Promise<ArcadeGame> | ArcadeGame;
  /** Awaited before the first step. Preload images and audio here. */
  preload?(): Promise<void>;
}
