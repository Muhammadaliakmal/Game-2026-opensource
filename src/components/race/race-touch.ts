/**
 * Thumb inputs for riding.
 *
 * A plain module object, not a store: these are read every frame by the bike's
 * frame loop and nothing should re-render sixty times a second for a button
 * being held. Same reasoning as play/touch-input.ts.
 *
 * All of them are momentary. A latched throttle sounds convenient and is not —
 * on a track with walls, "I cannot stop" is the one state a rider must never
 * be able to reach by accident. Boost and drift follow the same rule for the
 * same reason.
 *
 * `steer` is the exception in kind rather than in principle: it is analogue,
 * -1..1, because the tilt and assist schemes produce a continuous value that
 * no button could express. The joystick scheme leaves it at 0 and writes to
 * ecctrl's joystick store instead, which the bike already reads.
 */
export const raceTouch = {
  throttle: false,
  brake: false,
  reverse: false,
  boost: false,
  drift: false,
  lookBack: false,
  steer: 0,
  /**
   * Whether the bike should steer itself. Set by the touch controls while the
   * assisted scheme is mounted, and therefore false on every desktop — the
   * setting lives under Touch, and a mouse-and-keyboard rider never asked for
   * it.
   */
  assist: false,
};

/** Release everything. Called when the controls unmount or the tab hides. */
export function releaseRaceTouch() {
  raceTouch.throttle = false;
  raceTouch.brake = false;
  raceTouch.reverse = false;
  raceTouch.boost = false;
  raceTouch.drift = false;
  raceTouch.lookBack = false;
  raceTouch.steer = 0;
  raceTouch.assist = false;
}
