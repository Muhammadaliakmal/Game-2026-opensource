/**
 * The calendar, as the game sees it: which day it is, which week it is, and
 * what today's challenge is.
 *
 * ── One clock, and it is UTC ─────────────────────────────────────────────
 *
 * The arcade's daily cap rolls over at the player's own midnight, because
 * that cap defends a balance and the worst a lie about the date buys is a
 * day's ceiling. A daily challenge is the opposite case: it is *shared*. The
 * whole point is that everyone on the site is chasing the same course today,
 * and "today" has to be one day for all of them or a player in Auckland is
 * on tomorrow's course while one in Lima is still on yesterday's. So the day
 * and the week are UTC, computed identically by the hub that shows the card
 * and by the route that pays the bonus, and neither side trusts the other's
 * answer.
 *
 * ── The week is ISO ──────────────────────────────────────────────────────
 *
 * Monday to Sunday, keyed `YYYY-Www`. A week that started on Sunday would be
 * the American convention and nobody else's; ISO is the one every calendar
 * library agrees on, and it is what `date_trunc('week')` in Postgres does.
 *
 * ── Why the pick is a hash and not a rotation ────────────────────────────
 *
 * `day % courses.length` would walk the ladder in order, so the challenge
 * would climb Tutorial → Expert over twenty days and a player who joined on
 * day 18 meets Lattice first. A hash scatters the pick, and mixing the year
 * in means the same date next year is a different course. It is still
 * deterministic — that is the property that lets two machines agree.
 *
 * Pure, imports nothing, and takes the course list as an argument rather
 * than importing `built-in-worlds` — which imports three.js through the
 * generators, and the room server and the runs route must not.
 */

/** `YYYY-MM-DD` in UTC. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * `YYYY-Www`, the ISO week the date falls in.
 *
 * The standard algorithm: shift the date to the Thursday of its week, and
 * the year that Thursday is in is the ISO year. Week 1 is the week with the
 * year's first Thursday.
 */
export function weekKey(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO day: Monday 1 … Sunday 7.
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const isoYear = d.getUTCFullYear();
  const jan1 = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** When the current UTC day ends — for a "resets in" readout. */
export function dayEndsAt(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
}

/** FNV-1a over a string. Small, fast, and not a security primitive. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Today's challenge: one course from the list, the same one for everybody.
 *
 * `courses` is the shipped ladder in order. The pick is by day key so it is
 * stable for the whole UTC day and different tomorrow; the salt keeps the
 * sequence from being the same walk as any other hash over the same dates.
 */
export function dailyPick<T>(courses: readonly T[], now: Date = new Date()): T | null {
  if (courses.length === 0) return null;
  return courses[fnv1a(`daily:${dayKey(now)}`) % courses.length];
}

/**
 * What finishing today's challenge pays, on top of whatever the course itself
 * pays for the result. Once per day per player — the route holds that with a
 * column the client cannot write.
 *
 * Deliberately smaller than a Gold: the challenge is a reason to open the
 * game today, not a reason to skip every other course.
 */
export const DAILY_BONUS = 40;
