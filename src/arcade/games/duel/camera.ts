/**
 * Where the duel's camera looks, and how close.
 *
 * The fight was drawn at one fixed framing: the whole 960×540 arena, always,
 * so on a phone two robots trading blows at the far end of the bridge were a
 * few dozen pixels tall. A fighting game frames the fight, not the room — it
 * closes in while the two are near each other and pulls out as they part —
 * and against the CPU it leans toward the fighter you are playing, because
 * that is the one whose footing you are judging.
 *
 * Pure and deterministic, like `arm-ik.ts`, so `camera.test.ts` can hold it
 * to its three promises without a canvas:
 *
 *  - **both fighters stay in frame**, with room around them for a swing;
 *  - **the view never leaves the arena** — the centre is clamped so no edge
 *    of the world is ever on screen, however far it zooms;
 *  - **it never zooms out past the whole arena** (1) nor closer than
 *    `MAX_ZOOM`, past which a jump takes the jumper out of the top.
 *
 * The simulation does not know it exists: it runs at the fixed view for the
 * reason `view.ts` gives, and this only changes what is drawn.
 */

export interface Cam {
  x: number;
  y: number;
  z: number;
}

export const MAX_ZOOM = 1.7;
/** Room kept around the pair, in view pixels — a swing's reach plus a jump. */
const PAD_X = 300;
const PAD_Y = 260;
/** How much of the framing belongs to the player, against the CPU. */
const PLAYER_BIAS = 0.64;
/** Heads are what you watch; the frame sits a little above the pelvises. */
const LIFT = 40;

export function frameFight(
  px: number,
  py: number,
  ox: number,
  oy: number,
  solo: boolean,
  viewW: number,
  viewH: number
): Cam {
  const bias = solo ? PLAYER_BIAS : 0.5;
  const fx = px * bias + ox * (1 - bias);
  const fy = py * bias + oy * (1 - bias) - LIFT;

  // Wide enough that the frame, centred where it is BIASED, still holds the
  // far fighter: the far one is further from the centre than half the gap.
  const far = Math.max(Math.abs(px - fx), Math.abs(ox - fx));
  const farY = Math.max(Math.abs(py - fy), Math.abs(oy - fy));
  const spanX = far * 2 + PAD_X;
  const spanY = farY * 2 + PAD_Y;
  const z = Math.max(1, Math.min(MAX_ZOOM, viewW / spanX, viewH / spanY));

  const halfW = viewW / (2 * z);
  const halfH = viewH / (2 * z);
  return {
    x: Math.max(halfW, Math.min(viewW - halfW, fx)),
    y: Math.max(halfH, Math.min(viewH - halfH, fy)),
    z,
  };
}

/** Ease `cam` toward `target`. Frame-rate independent. */
export function follow(cam: Cam, target: Cam, dt: number, rate = 4): void {
  const k = 1 - Math.exp(-dt * rate);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
  cam.z += (target.z - cam.z) * k;
}
