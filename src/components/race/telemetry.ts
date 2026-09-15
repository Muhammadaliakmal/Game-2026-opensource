/**
 * What the bike is doing, for the HUD to draw.
 *
 * A plain module object, written by the bike's frame loop and read by a HUD
 * that samples it on its own schedule. Not store state, and deliberately not:
 * speed changes every frame, and a speedometer driven through React would
 * re-render the whole HUD sixty times a second to move one needle. The same
 * reasoning as `race-touch.ts` and the editor's coordinate readout.
 *
 * Distinct from the debug telemetry that was retired in Phase 5 — that existed
 * to find out why the bike would not move. This is a gauge the player reads.
 */
export const raceTelemetry = {
  /** Signed speed along the heading, world units per second. */
  speed: 0,
  /** Top speed available right now — rises while boosting. */
  topSpeed: 1,
  /** Boost in the tank, 0..1. */
  boost: 0,
  /** Charge earned this drift but not yet banked, 0..1. */
  charge: 0,
  drifting: false,
  boosting: false,
  /**
   * Whether the rider is under their own control at all — false on the grid,
   * during the lights, and after the flag.
   *
   * Here rather than derived from the race store because the two things that
   * read it (the boost button's armed state, and the sim itself) both want the
   * value the *simulation* is acting on this frame, not the value React last
   * rendered with.
   */
  riding: false,
  /**
   * Crashes, as a counter and the speed the last one cost. Written by the
   * bike on the frame an impact is confirmed, read by whatever wants to react
   * — the sound, today — by watching the counter move. A counter rather than
   * a flag because a flag set in one frame loop and cleared in another is a
   * race about which runs first; a counter is compared, never cleared.
   */
  impacts: 0,
  impactLoss: 0,
};

/**
 * The floor a boost can be fired from, as a fraction of the tank.
 *
 * ── Why there is a floor at all ──────────────────────────────────────────
 *
 * The gate used to be `boost > 0`, which is technically a gate and practically
 * none: the trickle refills the tank continuously, so a rider tapping BOOST
 * against an empty meter gets a shove every time the trickle crosses zero
 * again. That is a mechanic nobody chose — it is a way of holding the boost
 * button down that happens to work — and it hollows out the drift, which is
 * the thing the whole mode is built around.
 *
 * ── Why it lives here ────────────────────────────────────────────────────
 *
 * It is the contract between the simulation and the button, and it has to be
 * ONE number. The bug this fixes was precisely the two disagreeing: the sim
 * gated the thrust and the button's fill state was driven by whether it had
 * ever been pressed, so a player looked at a solid white BOOST button over an
 * empty meter for eighteen seconds. A button whose armed state is derived from
 * the same constant the effect gates on cannot drift from it.
 *
 * `telemetry.ts` imports nothing, so both sides can read it without either one
 * pulling in the other.
 */
export const BOOST_MIN_TO_FIRE = 0.08;

/** Is there enough in the tank to fire, right now? The one answer both sides use. */
export function boostArmed(): boolean {
  return raceTelemetry.riding && raceTelemetry.boost >= BOOST_MIN_TO_FIRE;
}

/** Back to a standing start — called when a bike mounts or is recovered. */
export function resetTelemetry() {
  raceTelemetry.speed = 0;
  raceTelemetry.boost = 0;
  raceTelemetry.charge = 0;
  raceTelemetry.drifting = false;
  raceTelemetry.boosting = false;
  raceTelemetry.impacts = 0;
  raceTelemetry.impactLoss = 0;
  raceTelemetry.riding = false;
}

/**
 * World units per second as a number a player understands.
 *
 * There is no real-world scale here to convert from — a block is a block — so
 * this is a display multiplier chosen so the bike's 18 u/s top speed reads as
 * a plausible 180. Arcade racers have always done exactly this.
 */
export const KPH_PER_UNIT = 10;
