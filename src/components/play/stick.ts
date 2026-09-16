import { approachYaw } from "./camera-rig";

/**
 * Shapes the thumbstick before ecctrl sees it.
 *
 * ecctrl reads the stick as a vector in the camera's frame, normalises it, and
 * re-reads it against the camera every frame. Two things go wrong with that
 * on a phone, and neither is a sensitivity number:
 *
 * ── Any touch is full speed ──────────────────────────────────────────────
 *
 * The normalise means a two-pixel nudge is the same as the stick at its
 * limit — which is what "a tiny movement causes a huge movement" is. A thumb
 * resting on the knob drifts by more than two pixels. So there is a radial
 * dead zone: inside it the stick is neutral, and the travel outside it is
 * rescaled so the first real push still starts from zero rather than
 * stepping to the edge of the zone.
 *
 * ── The spiral ───────────────────────────────────────────────────────────
 *
 * On touch the camera steers itself to look where the character is running.
 * Hold the stick to the right and the character goes right, the camera
 * swings to follow, "right" on the stick now points somewhere new, the
 * character curves after it, the camera follows that too — and a turn that
 * should have been a corner is a circle. That is why changing direction
 * felt like a fight.
 *
 * The fix is that the stick's frame is captured when the thumb pushes off
 * neutral and held while it stays down. The thumb points at a *world*
 * heading, and the camera coming round behind the character does not change
 * what the thumb meant. Only a deliberate look — the other thumb dragging —
 * moves the frame with it, so "run forward and look around" still turns the
 * character with the view. Lift the thumb and push again, and the new push
 * means what the player now sees.
 *
 * ── Turning is eased, not snapped ────────────────────────────────────────
 *
 * The heading follows the thumb through a short time constant, so a jitter
 * of a few degrees reads as a steady line and a sweep of the thumb turns the
 * character in a smooth arc — while a reversal, the one turn a runner needs
 * instantly, snaps. The character is a runner, not a vehicle: the easing is
 * long enough to remove the tremor and short enough never to be felt as
 * inertia.
 *
 * Pure, so it can be tested without a canvas. Headings are world angles in
 * the rig's convention (0 faces north, `-z`; positive turns east, `+x`).
 */
export const STICK = {
  /** Radial dead zone, as a fraction of the stick's full travel. */
  deadzone: 0.18,
  /**
   * How fast the heading closes on the thumb, as a per-second rate through
   * `1 - exp(-rate * dt)`. 16 is a time constant of about sixty milliseconds:
   * three or four frames to settle, which the eye reads as immediate and the
   * hand reads as smooth.
   */
  turnRate: 16,
  /** A change of heading larger than this (radians) snaps instead of easing. */
  reversal: 2.0,
} as const;

export interface StickInput {
  x: number;
  y: number;
}

export interface StickState {
  /** The thumb is outside the dead zone. */
  held: boolean;
  /** Camera yaw the stick's "up" was captured against, moved only by a manual look. */
  refYaw: number;
  /** The world heading currently being fed to the controller. */
  heading: number;
  /** Camera yaw seen last frame, to tell a look from a follow. */
  lastYaw: number;
}

export function createStickState(): StickState {
  return { held: false, refYaw: 0, heading: 0, lastYaw: 0 };
}

/** ecctrl's stick angle: 0 is up (camera forward), positive is right. */
function stickAngle(x: number, y: number): number {
  return Math.atan2(x, y);
}

/**
 * One frame of shaping.
 *
 * `yaw` is the camera's current look yaw; `manualLook` says whether the
 * camera is under the player's hand right now (as opposed to following the
 * character on its own). Returns the vector to hand to ecctrl, in ecctrl's
 * convention (y forward, x right, relative to the camera *this* frame).
 */
export function shapeStick(
  raw: StickInput,
  yaw: number,
  manualLook: boolean,
  dt: number,
  s: StickState
): StickInput {
  const m = Math.hypot(raw.x, raw.y);

  if (m < STICK.deadzone) {
    // Neutral. Nothing is held on to: the next push will be read fresh
    // against whatever the player is looking at then.
    s.held = false;
    s.lastYaw = yaw;
    return { x: 0, y: 0 };
  }

  // Rescale so the push starts from zero at the edge of the zone. ecctrl
  // normalises anyway, so this only matters for anything that reads the
  // magnitude — but it keeps the vector honest.
  const mag = Math.min(1, (m - STICK.deadzone) / (1 - STICK.deadzone));
  const theta = stickAngle(raw.x, raw.y);

  if (!s.held) {
    // A fresh push means exactly what the player sees. Capture the frame,
    // and snap the heading — easing in from wherever it was last held would
    // be a wobble at the start of every move.
    s.held = true;
    s.refYaw = yaw;
    s.heading = theta - yaw;
  } else {
    // A deliberate look drags the frame with it, so a character running
    // forward keeps running "forward" as the view turns. The camera's own
    // follow does not, which is what breaks the spiral.
    if (manualLook) s.refYaw += wrap(yaw - s.lastYaw);

    const target = theta - s.refYaw;
    const delta = wrap(target - s.heading);
    if (Math.abs(delta) > STICK.reversal) {
      s.heading = target;
    } else {
      s.heading = approachYaw(s.heading, target, 1 - Math.exp(-STICK.turnRate * dt));
    }
  }
  s.lastYaw = yaw;

  // Back into the camera's frame for this frame.
  const out = s.heading + yaw;
  return { x: mag * Math.sin(out), y: mag * Math.cos(out) };
}

/** The signed short way round: `a` folded into (-π, π]. */
function wrap(a: number): number {
  const TAU = Math.PI * 2;
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/**
 * The world heading a camera-relative stick vector points along — the same
 * algebra `shapeStick` uses, exported so a test can check the result in
 * world terms without repeating the rig's conventions.
 */
export function worldHeading(v: StickInput, yaw: number): number {
  return wrap(stickAngle(v.x, v.y) - yaw);
}
