/**
 * What the engine is doing, as numbers a synth can follow. Pure, for the test.
 *
 * ── Why gears ────────────────────────────────────────────────────────────
 *
 * The first engine mapped speed straight onto pitch: one long whine from 52 Hz
 * to 290 Hz, a sawtooth and a square through a resonant filter. Two things
 * were wrong with it, and players heard both as "the bike sounds bad". A pitch
 * that only ever climbs reads as a siren, not a motor — a motor revs, drops
 * when it shifts, and revs again. And half of that range was under what a
 * phone speaker can play (see "Judge a sound on a phone speaker" in
 * CLAUDE.md), so a phone heard the buzz of the harmonics and none of the body.
 *
 * So: five gears up to the bike's top speed and a sixth the boost pulls into,
 * revs between a floor and the redline inside each, and a fundamental that
 * never goes below `MIN_HZ`.
 */

/** Mirrors `Bike.tsx`. */
export const MAX_SPEED = 18;
export const BOOST_TOP_SPEED = 26;

/** The fundamental at idle and at the redline. Nothing under ~90 Hz: a phone cannot play it. */
export const MIN_HZ = 92;
export const MAX_HZ = 300;

/** Where each gear tops out, in u/s. The last is the boost's overrev. */
export const GEAR_TOPS = [4.2, 8, 11.8, 15, MAX_SPEED + 0.5, BOOST_TOP_SPEED + 1] as const;

/** Revs a gear starts at after the shift into it, as a fraction of the redline. */
const SHIFT_FLOOR = 0.52;
/** Revs at a standstill. */
const IDLE = 0.18;
/** How far past a gear's top before shifting up, and how far under its bottom before shifting down. */
const HYSTERESIS = 0.6;

export interface EngineNote {
  gear: number;
  /** 0..1 from idle to the redline. */
  rpm: number;
  /** Fundamental, Hz. */
  hz: number;
}

/** The gear for this speed, sticking with the last one inside a small band so it does not hunt. */
export function gearFor(speed: number, last: number): number {
  const v = Math.abs(speed);
  let g = 0;
  while (g < GEAR_TOPS.length - 1 && v > GEAR_TOPS[g]) g++;
  if (last >= 0 && last < GEAR_TOPS.length) {
    // Stay up a gear until clearly under it; stay down until clearly over.
    if (g === last - 1 && v > GEAR_TOPS[g] - HYSTERESIS) return last;
    if (g === last + 1 && v < GEAR_TOPS[last] + HYSTERESIS) return last;
  }
  return g;
}

export function engineNote(speed: number, lastGear: number): EngineNote {
  const v = Math.abs(speed);
  const gear = gearFor(v, lastGear);
  const lo = gear === 0 ? 0 : GEAR_TOPS[gear - 1];
  const hi = GEAR_TOPS[gear];
  const frac = Math.max(0, Math.min(1.05, (v - lo) / (hi - lo)));
  const floor = gear === 0 ? IDLE : SHIFT_FLOOR;
  const rpm = Math.min(1.05, floor + (1 - floor) * frac);
  return { gear, rpm, hz: MIN_HZ + (MAX_HZ - MIN_HZ) * rpm };
}
