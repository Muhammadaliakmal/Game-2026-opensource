/**
 * The daily-challenge streak: how many days in a row it has been finished.
 *
 * ── Per browser, on purpose ──────────────────────────────────────────────
 *
 * The bonus is paid by the server once per UTC day, so the server knows the
 * days. It does not keep them — one column holds the last day paid — and a
 * streak is the kind of number that is worth more as a feeling than as a
 * fact: it exists to be looked at on the hub, not to be audited. So it
 * lives beside the best times, in localStorage, and a cleared browser is a
 * fresh streak. If it ever pays anything, it moves to the row.
 *
 * ── The arithmetic is pure ───────────────────────────────────────────────
 *
 * `advance` takes what was stored and today's key and returns what to store.
 * Yesterday's day continues the streak; today's again leaves it alone; any
 * other day starts over at one. The day keys are `lib/daily.ts`'s, so the
 * streak rolls over at the same midnight the challenge does.
 */

export interface Streak {
  /** The last UTC day the challenge was finished, `YYYY-MM-DD`. */
  last: string;
  /** Consecutive days ending on `last`. */
  count: number;
}

/** The day before a `YYYY-MM-DD` key, as a key. */
export function dayBefore(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** What the streak becomes when today's challenge is finished. */
export function advance(streak: Streak | null, today: string): Streak {
  if (!streak) return { last: today, count: 1 };
  if (streak.last === today) return streak;
  if (streak.last === dayBefore(today)) return { last: today, count: streak.count + 1 };
  return { last: today, count: 1 };
}

/**
 * The streak as it stands today: intact if it was finished today or
 * yesterday (yesterday's is still alive — today is the day to keep it), and
 * over if the last finish is older than that.
 */
export function current(streak: Streak | null, today: string): number {
  if (!streak) return 0;
  if (streak.last === today || streak.last === dayBefore(today)) return streak.count;
  return 0;
}

/** Whether today's challenge has already been finished. */
export const doneToday = (streak: Streak | null, today: string) =>
  streak !== null && streak.last === today;

const KEY = "blockworld:daily-streak";
const listeners = new Set<() => void>();

export function readStreak(): Streak | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Streak>;
    if (typeof parsed.last !== "string" || typeof parsed.count !== "number") return null;
    return { last: parsed.last, count: parsed.count };
  } catch {
    return null;
  }
}

/** Record today's finish. Returns the new streak. */
export function recordFinish(today: string): Streak {
  const next = advance(readStreak(), today);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* the streak lasts the session */
  }
  for (const fn of listeners) fn();
  return next;
}

export function onStreakChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
