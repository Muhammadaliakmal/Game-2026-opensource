/**
 * When a play counts, and the arithmetic that decides it.
 *
 * ── Why not on the card click ────────────────────────────────────────────
 *
 * Because the number is going to sort the site. A count fired on a click
 * counts curiosity, bounces, prefetches and every accidental press, and the
 * "Popular this week" rail built on it would rank the cards that happen to sit
 * where thumbs land. The spec is blunt about it — "that inflates counts and
 * makes the ranking useless" — and the ranking is the entire product of this
 * feature.
 *
 * So a play is ten seconds of the game actually running, once per tab session.
 * Both halves matter. Without the clock, opening a cabinet is a play. Without
 * the session guard, reloading in a loop is a play counter.
 */

/** Ten seconds of unpaused play, from the spec. */
export const PLAY_THRESHOLD_MS = 10_000;

/**
 * Wall time spent with the game actually running.
 *
 * ── Why it is a class and not a `setTimeout` ─────────────────────────────
 *
 * A timer started on mount and fired ten seconds later measures how long the
 * page was open, which is a different quantity and a larger one: it counts a
 * paused game, a backgrounded tab, a phone in a pocket, and the ten minutes
 * somebody left the death screen up. This accumulates only the intervals
 * between `resume` and `pause`, so the ten seconds have to be ten seconds of
 * play.
 *
 * Pure, and given its clock, so the tests can run a simulated ten minutes in
 * no time at all — the same shape `lib/frame-cap.ts` and the arcade's loop
 * are written in, and for the same reason.
 */
export class PlayTimer {
  private accumulated = 0;
  private startedAt: number | null = null;

  constructor(private readonly thresholdMs: number = PLAY_THRESHOLD_MS) {}

  /** Begin, or resume after a pause. A second call while running is ignored. */
  resume(now: number): void {
    if (this.startedAt !== null) return;
    this.startedAt = now;
  }

  /** Stop the clock, banking what has run. Ignored if already paused. */
  pause(now: number): void {
    if (this.startedAt === null) return;
    // A clock that went backwards — a system time change, a `performance.now`
    // read across a suspend — contributes nothing rather than a negative.
    this.accumulated += Math.max(0, now - this.startedAt);
    this.startedAt = null;
  }

  /** Unpaused milliseconds so far, including the interval still running. */
  elapsed(now: number): number {
    const live = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
    return this.accumulated + live;
  }

  /** Whether this run has earned its count yet. */
  reached(now: number): boolean {
    return this.elapsed(now) >= this.thresholdMs;
  }

  get running(): boolean {
    return this.startedAt !== null;
  }
}

/**
 * Slugs already counted in this tab.
 *
 * `sessionStorage`, not `localStorage`: a session is the right window. Come
 * back tomorrow and play the same course again and that is genuinely another
 * play; refresh the page four times in a minute and it is not. The key
 * survives a reload of the same tab, which is exactly what closes the
 * reload-in-a-loop hole, and dies with the tab, which is what stops the
 * counter from being a once-per-device-forever thing.
 *
 * Every access is wrapped: a private window can throw on the first read, and
 * a play counter is never worth an exception inside a render.
 */
const COUNTED_KEY = "sdg_counted";

function readCounted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(COUNTED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((s): s is string => typeof s === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function alreadyCounted(slug: string): boolean {
  if (typeof window === "undefined") return true;
  return readCounted().has(slug);
}

export function markCounted(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    const counted = readCounted();
    counted.add(slug);
    sessionStorage.setItem(COUNTED_KEY, JSON.stringify([...counted]));
  } catch {
    /* No storage: the guard below still holds for this page view, because the
       hook keeps its own flag. It simply will not survive a reload. */
  }
}

/**
 * Tell the server about a play. Fire and forget, and silent on every path.
 *
 * The rule the whole feature is deployed under: "a Redis outage must never
 * block a play" — here, a database outage. There is nothing for the player to
 * do about a failure, nothing they would want to read about it, and no retry
 * worth making, since the server answers 204 even when it is rate-limiting
 * and a client that retried would only spend the rest of its budget.
 *
 * `keepalive` so a count fired as somebody navigates away still leaves.
 */
export async function reportPlay(slug: string): Promise<void> {
  try {
    await fetch("/api/stats/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    });
  } catch {
    /* see above */
  }
}
