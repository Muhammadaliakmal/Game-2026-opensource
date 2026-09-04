import { HALF_WIDTH, trackDistance } from "./race-track";

/**
 * Steering assist: what the bike would do if it steered itself.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * A thumb is not a steering wheel. On a phone the difference between a corner
 * taken and a corner missed is about four pixels of thumb travel, and the
 * result is that a new player spends their first race bouncing between the
 * rails and never sees the game. Every mainstream mobile racer ships an assist
 * for exactly this reason, and every one of them makes it the default.
 *
 * The assist is not an autopilot. It produces a steering value that keeps the
 * bike pointed round the track and near the racing line; the rider's own input
 * is added on top and always wins where the two disagree (see `Bike`). Someone
 * who never touches the steering finishes the lap slowly. Someone who does
 * goes faster. That is the right shape for an accessibility feature.
 *
 * ── Why the maths is this small ──────────────────────────────────────────
 *
 * Neon Circuit is a signed distance field around a rounded box, and it encloses
 * the origin. Two consequences do all the work:
 *
 *  - The road direction at any point is the perpendicular to the field's own
 *    gradient, and which of the two perpendiculars is forwards follows from
 *    the loop enclosing the origin. No waypoint list, nothing to keep in sync
 *    with the generator.
 *  - "How far off line am I" is `trackDistance` — the same function the track
 *    was stamped from, so the assist and the geometry cannot disagree.
 *
 * No three.js here, for the same reason `race-track.ts` has none: this is
 * arithmetic, and it is called from a frame loop.
 */

/** How hard the assist pulls back toward the centreline, relative to forward. */
const CENTRE_GAIN = 1.15;
/** Steering per radian of error. 1.6 turns a 35° error into full lock. */
const STEER_GAIN = 1.6;
/** Below this, the bike is pointed where it should be; do nothing. */
const DEADBAND = 0.02;

/** Shortest signed angle from `a` to `b`, in (-pi, pi]. */
export function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

/**
 * The racing direction at a world position, as a unit (x, z).
 *
 * ── Why this is not simply the polar tangent ─────────────────────────────
 *
 * `lapProgress` measures a lap by the polar angle about the origin, so the
 * obvious tangent is the perpendicular to the radius, `(z, -x)`. That is
 * exactly right for a circular track and quietly wrong for this one: down the
 * middle of a straight the radius is not perpendicular to the road, so the
 * polar tangent aims a few degrees inward, and a bike following it slides
 * steadily toward the infield for the whole length of the straight. It steers
 * beautifully and arrives at the corner on the wrong side of the road.
 *
 * The road direction is the perpendicular to the distance field's own normal —
 * exact for whatever shape the field describes, straights included. The polar
 * tangent still decides which of the two perpendiculars is forwards, which is
 * the one thing it is genuinely authoritative about.
 */
export function trackTangent(x: number, z: number): [number, number] {
  const r = Math.hypot(x, z);
  const px = Number.isFinite(r) && r > 1e-6 ? z / r : 1;
  const pz = Number.isFinite(r) && r > 1e-6 ? -x / r : 0;

  const [nx, nz] = trackNormal(x, z);
  // Degenerate only deep in the infield, where the field is flat and there is
  // no road to be pointed along anyway.
  if (nx === 0 && nz === 0) return [px, pz];

  let tx = nz;
  let tz = -nx;
  if (tx * px + tz * pz < 0) {
    tx = -tx;
    tz = -tz;
  }
  return [tx, tz];
}

/**
 * Outward normal of the track's distance field, as a unit (x, z).
 *
 * Taken numerically. The analytic gradient of a rounded box degenerates in the
 * flat region inside the corner radius, and a special case there would be more
 * code than two subtractions.
 */
export function trackNormal(x: number, z: number): [number, number] {
  const e = 0.5;
  const gx = trackDistance(x + e, z) - trackDistance(x - e, z);
  const gz = trackDistance(x, z + e) - trackDistance(x, z - e);
  const len = Math.hypot(gx, gz);
  if (!Number.isFinite(len) || len < 1e-6) return [0, 0];
  return [gx / len, gz / len];
}

/**
 * The heading the assist wants, given a position on (or near) the track.
 *
 * Forward is `(sin(yaw), cos(yaw))`, matching the bike.
 */
export function assistHeading(x: number, z: number): number {
  const [tx, tz] = trackTangent(x, z);
  const [nx, nz] = trackNormal(x, z);

  // Positive outside the racing surface, negative inside it. Clamped so a bike
  // that has left the track entirely aims straight back at it rather than
  // asking for a steering value it cannot produce.
  const off = Math.max(-1, Math.min(1, trackDistance(x, z) / HALF_WIDTH));
  const dx = tx - nx * off * CENTRE_GAIN;
  const dz = tz - nz * off * CENTRE_GAIN;
  return Math.atan2(dx, dz);
}

/**
 * Suggested steering, -1..1, in the bike's own sign convention.
 *
 * Positive steers right, which DECREASES yaw — three.js is right-handed and
 * Y-up, so with forward at +Z the rider's right hand is -X. Getting this
 * backwards produces an assist that drives the bike into the wall it is trying
 * to avoid, which is why it is written down here rather than inferred.
 */
export function assistSteer(x: number, z: number, heading: number): number {
  const want = assistHeading(x, z);
  const err = angleDelta(heading, want);
  if (Math.abs(err) < DEADBAND) return 0;
  return Math.max(-1, Math.min(1, -err * STEER_GAIN));
}
