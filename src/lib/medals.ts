import { fastestRoute, surfaces, surfaceUnder } from "./course-graph";
import type { WorldDoc } from "./worlddoc";

/**
 * Medal times, derived from the course rather than guessed at.
 *
 * ── Where the Author time comes from ─────────────────────────────────────
 *
 * `course-graph.ts` can find the cheapest route through a map: walking edges
 * cost distance over run speed, jump edges cost their airtime. That number is
 * a hard physical floor — it assumes instant acceleration, perfect pathing and
 * no aiming — so nobody will ever match it, and it is not a target. It is a
 * *measurement of the course*, and it is the only honest input available here.
 *
 * The Author time is that floor times `HUMAN`, and the rest of the ladder is
 * multiples of the Author time. The whole calibration is those four constants.
 *
 * ── What is being claimed, and what is not ───────────────────────────────
 *
 * These times have not been played. A designer's Author time is a lap they
 * actually drove; this is arithmetic with a fudge factor, and the fudge factor
 * is the part that is a guess. What it does buy:
 *
 *  - The times cannot be *impossible*, because they are anchored to a route
 *    the geometry admits.
 *  - They cannot silently rot. Move a pad and the floor moves with it; the
 *    test recomputes every course and fails if the constant no longer matches.
 *  - Retuning is one number, in one place, for every map at once.
 *
 * When there is real play data, `HUMAN` is what it replaces — or per-map
 * Author times land in `AUTHOR_MS` and this becomes the fallback for maps
 * without one.
 */

/**
 * How much slower a very good human is than the solver.
 *
 * The solver turns on a pin, leaves every platform at full speed and never
 * looks at where it is going. 1.3 is the assumption that a strong run gives up
 * about a third of that. It is the least defensible number in this file and
 * the easiest to fix.
 */
const HUMAN = 1.3;

/** Each medal as a multiple of the Author time. */
const LADDER = {
  author: 1,
  gold: 1.15,
  silver: 1.4,
  // Deliberately loose: Bronze is "you finished it competently", and with the
  // clock running through every fall a first clear is much slower than a
  // clean lap. A Bronze nobody gets on their third attempt is not a reward,
  // it is a fifth way to be told you are bad at the game.
  bronze: 2,
} as const;

/** Best first — the order they are awarded and displayed in. */
export const MEDALS = ["author", "gold", "silver", "bronze"] as const;
export type Medal = (typeof MEDALS)[number];

export const MEDAL_LABELS: Record<Medal, string> = {
  author: "Author",
  gold: "Gold",
  silver: "Silver",
  bronze: "Bronze",
};

/**
 * The solver's route through a course, in milliseconds.
 *
 * Returns null for a world that is not a course — no goal, or a goal nothing
 * can reach. Exported for the test that keeps `AUTHOR_MS` honest; nothing at
 * runtime should call it, because it is a Dijkstra over every surface in the
 * world and the answers for the maps that ship are already written down.
 */
export function routeFloorMs(doc: WorldDoc): number | null {
  if (!doc.goal) return null;
  const all = surfaces(doc.parts);
  const from = surfaceUnder(doc.spawn, all);
  const to = surfaceUnder(doc.goal, all);
  if (!from || !to) return null;
  const seconds = fastestRoute(from, to, all);
  return seconds === null ? null : Math.round(seconds * 1000);
}

/** The Author time a route floor implies. */
export const authorFromFloor = (floorMs: number) => Math.round(floorMs * HUMAN);

/**
 * The fastest a submitted time is allowed to be, in ms. Null if unknown.
 *
 * The inverse of `authorFromFloor`: the solver's route is a hard physical
 * floor — instant acceleration, perfect pathing, no aiming — so a time under
 * it did not happen on this geometry, whatever produced it. This is the only
 * validation a run submission can do honestly. It is not anti-cheat: someone
 * determined can post the floor plus a millisecond and there is nothing here
 * that could tell. It is the guard that keeps a board from being ruined by one
 * `fetch` with a zero in it, which is the realistic threat to a game like
 * this, and it costs a lookup rather than a Dijkstra per request.
 */
export function floorMs(slug: string): number | null {
  const author = AUTHOR_MS[slug];
  return author === undefined ? null : Math.floor(author / HUMAN);
}

/**
 * The slowest a submitted time is allowed to be.
 *
 * An hour. Long enough that no genuine run is ever refused and short enough
 * that the column stays an `integer`.
 */
export const MAX_RUN_MS = 60 * 60 * 1000;

/**
 * Author times for the maps that ship, by slug.
 *
 * Written down rather than computed on demand: the computation is a Dijkstra
 * per map and these are constants of geometry that only changes when someone
 * edits a course. `medals.test.ts` recomputes all of them and fails with the
 * new value if one drifts, so this table cannot quietly go stale — it is a
 * cache with a test for a cache invalidator.
 */
export const AUTHOR_MS: Record<string, number> = {
  // Tutorial
  parkour: 26_701,
  steps: 37_961,
  lanterns: 27_944,
  meadow: 44_737,
  // Easy
  climb: 27_842,
  spiral: 47_232,
  bridges: 45_575,
  orchard: 33_306,
  // Medium
  gap: 27_580,
  ratchet: 36_997,
  switchyard: 25_701,
  turnpike: 40_218,
  // Hard
  vault: 24_678,
  zipline: 26_443,
  gauntlet: 32_317,
  needle: 40_642,
  // Expert
  overclock: 37_320,
  filament: 28_638,
  arclight: 30_532,
  lattice: 34_684,
};

/** Every medal time for a map, best first. Null if the map has no Author time. */
export function medalTimes(
  slug: string
): Array<{ medal: Medal; ms: number }> | null {
  const author = AUTHOR_MS[slug];
  if (author === undefined) return null;
  return MEDALS.map((medal) => ({
    medal,
    ms: Math.round(author * LADDER[medal]),
  }));
}

/**
 * The medal a time earns, or null for a finish that earned none.
 *
 * A finish with no medal is a real outcome and not an error: the course was
 * completed, which is the thing that matters, and the panel says so without
 * awarding anything.
 */
export function medalFor(slug: string, ms: number): Medal | null {
  const times = medalTimes(slug);
  if (!times) return null;
  for (const { medal, ms: threshold } of times) {
    if (ms <= threshold) return medal;
  }
  return null;
}

/** Is `a` a better medal than `b`? Null is worse than every medal. */
export function betterMedal(a: Medal | null, b: Medal | null): boolean {
  if (a === null) return false;
  if (b === null) return true;
  return MEDALS.indexOf(a) < MEDALS.indexOf(b);
}

/**
 * The next medal to chase, given what has been earned.
 *
 * `null` in means "show me the first thing to aim at", which is Bronze rather
 * than Author: the target on screen has to be the next one, or it is not a
 * target, it is a scoreboard.
 */
export function nextMedal(
  slug: string,
  earned: Medal | null
): { medal: Medal; ms: number } | null {
  const times = medalTimes(slug);
  if (!times) return null;
  const have = earned === null ? MEDALS.length : MEDALS.indexOf(earned);
  return have <= 0 ? null : times[have - 1];
}
