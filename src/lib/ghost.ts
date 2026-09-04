import { z } from "zod";

/**
 * A recorded run, as something small enough to keep a copy of per player.
 *
 * ── Why a fixed-rate track and not an event log ──────────────────────────
 *
 * A ghost only has to answer one question — "where was the record holder at
 * `t` ms into their run" — and it has to answer it sixty times a second while
 * the live runner is also being simulated. A fixed-rate track answers it with
 * an index and a lerp. An event log would need a cursor, and a cursor has to
 * be rewound every time the live runner restarts, which is the single most
 * common thing that happens on a parkour map.
 *
 * ── Why 10 Hz ────────────────────────────────────────────────────────────
 *
 * A ghost is a translucent figure the player glances at, not a physics replay:
 * nothing is ever resolved against it and nobody inspects it frame by frame.
 * At 10 Hz with interpolation between samples the motion is smooth at any
 * refresh rate, and a 30-second run costs about 300 samples. At 60 Hz it would
 * cost six times that to describe the same movement no more accurately than
 * the eye can see.
 *
 * ── Why fixed point ──────────────────────────────────────────────────────
 *
 * These land in a `jsonb` column, and a float serialises as up to seventeen
 * characters of which fifteen are noise: `12.300000000000001`. Rounding to
 * 1/64 of a unit — about a centimetre and a half, well under the width of the
 * figure being drawn — makes every number a short integer and cuts the stored
 * size of a typical run by roughly two thirds, with no visible difference.
 */

/** Milliseconds between samples. */
export const GHOST_STEP_MS = 100;

/**
 * The longest run that can be recorded, in samples.
 *
 * Three minutes. Longer than any shipped course's Bronze time, and a hard
 * ceiling matters because this is the one field of a submission whose size the
 * client chooses: without it a crafted body could put an arbitrary amount of
 * JSON in a row that every viewer of the leaderboard then pays for.
 */
export const GHOST_MAX_SAMPLES = 1800;

/** Units per stored integer. 1/64 of a block ≈ 1.5 cm. */
const POS_SCALE = 64;
/** Radians per stored integer, near enough a thousandth. */
const YAW_SCALE = 1000;

/** Ints per sample: x, y, z, yaw. */
const STRIDE = 4;

export interface GhostTrack {
  /** Milliseconds between consecutive samples. */
  step: number;
  /** Fixed-point samples, `STRIDE` ints each. See the scales above. */
  p: number[];
}

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * The wire and storage shape.
 *
 * Validated on the way in rather than trusted, like every other client-supplied
 * document: this is written by a browser and read back by every player who
 * opens the map.
 */
export const ghostSchema = z.object({
  step: z.number().int().min(16).max(1000),
  p: z
    .array(z.number().int().min(-1_000_000).max(1_000_000))
    .max(GHOST_MAX_SAMPLES * STRIDE)
    // A partial sample at the end would decode as a pose built from whatever
    // `undefined` arithmetic produces, which is NaN, which is a ghost that
    // vanishes rather than an error anybody can act on.
    .refine((p) => p.length % STRIDE === 0, {
      message: "ghost samples must be complete",
    }),
});

/** How long the recorded run lasted, in ms. */
export function ghostLengthMs(track: GhostTrack): number {
  const n = track.p.length / STRIDE;
  return n === 0 ? 0 : (n - 1) * track.step;
}

/**
 * Where the ghost was `ms` into its run.
 *
 * Clamped at both ends rather than returning null: before the start the ghost
 * stands on the line, and after the finish it stands on the goal. A ghost that
 * disappears the instant it wins is a ghost that vanishes exactly when the
 * player most wants to see how far behind they are.
 */
export function ghostPoseAt(track: GhostTrack, ms: number): GhostPose | null {
  const n = track.p.length / STRIDE;
  if (n === 0) return null;

  const at = Math.max(0, ms) / track.step;
  const i = Math.min(n - 1, Math.floor(at));
  const j = Math.min(n - 1, i + 1);
  const t = i === j ? 0 : at - i;

  const a = i * STRIDE;
  const b = j * STRIDE;
  const lerp = (u: number, v: number) => u + (v - u) * t;

  return {
    x: lerp(track.p[a], track.p[b]) / POS_SCALE,
    y: lerp(track.p[a + 1], track.p[b + 1]) / POS_SCALE,
    z: lerp(track.p[a + 2], track.p[b + 2]) / POS_SCALE,
    // Angles take the short way round, or a ghost crossing the ±pi seam
    // spins a full turn on the spot between two samples.
    yaw: shortestLerp(
      track.p[a + 3] / YAW_SCALE,
      track.p[b + 3] / YAW_SCALE,
      t
    ),
  };
}

function shortestLerp(a: number, b: number, t: number): number {
  const TAU = Math.PI * 2;
  const delta = (((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI;
  return a + delta * t;
}

/**
 * Accumulates poses at a fixed rate while a run is in progress.
 *
 * Pure, and driven by whatever clock the caller has: the frame loop passes the
 * run's own elapsed time, so a dropped frame produces a repeated sample rather
 * than a track that runs slow. Held as a class because a recorder is a thing
 * with a lifetime — it is reset on every restart, and there is exactly one.
 */
export class GhostRecorder {
  private readonly out: number[] = [];
  /** Index of the next sample slot to fill. */
  private next = 0;
  private full = false;

  reset() {
    this.out.length = 0;
    this.next = 0;
    this.full = false;
  }

  /**
   * Offer a pose at `ms` into the run.
   *
   * Samples are placed by their slot rather than appended, so the track is
   * always at the declared rate no matter how often this is called. A long
   * frame — a tab waking up — leaves a gap, which is filled by repeating the
   * last pose: the ghost holds still for a moment, which is honest, rather
   * than the whole remainder of the run sliding earlier.
   */
  sample(ms: number, x: number, y: number, z: number, yaw: number) {
    if (this.full) return;
    if (!Number.isFinite(ms) || ms < 0) return;

    const slot = Math.floor(ms / GHOST_STEP_MS);
    if (slot < this.next) return;
    if (slot >= GHOST_MAX_SAMPLES) {
      this.full = true;
      return;
    }

    // Fill any slots the frame rate skipped over with the last known pose.
    while (this.next < slot && this.next > 0) {
      const last = (this.next - 1) * STRIDE;
      this.out.push(
        this.out[last],
        this.out[last + 1],
        this.out[last + 2],
        this.out[last + 3]
      );
      this.next++;
    }
    // A run whose first sample arrives late starts at that pose; there is no
    // earlier one to repeat, and inventing the spawn would be a guess.
    this.next = slot + 1;

    this.out.push(
      Math.round(x * POS_SCALE),
      Math.round(y * POS_SCALE),
      Math.round(z * POS_SCALE),
      Math.round(yaw * YAW_SCALE)
    );
  }

  /** The track so far, or null if nothing worth replaying was recorded. */
  track(): GhostTrack | null {
    // Two samples is the shortest thing that can be interpolated, and a run
    // that produced fewer than that is a run nobody wants to watch.
    if (this.out.length < STRIDE * 2) return null;
    return { step: GHOST_STEP_MS, p: [...this.out] };
  }
}
