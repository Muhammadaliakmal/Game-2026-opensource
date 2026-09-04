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
};

/** Back to a standing start — called when a bike mounts or is recovered. */
export function resetTelemetry() {
  raceTelemetry.speed = 0;
  raceTelemetry.boost = 0;
  raceTelemetry.charge = 0;
  raceTelemetry.drifting = false;
  raceTelemetry.boosting = false;
}

/**
 * World units per second as a number a player understands.
 *
 * There is no real-world scale here to convert from — a block is a block — so
 * this is a display multiplier chosen so the bike's 18 u/s top speed reads as
 * a plausible 180. Arcade racers have always done exactly this.
 */
export const KPH_PER_UNIT = 10;
