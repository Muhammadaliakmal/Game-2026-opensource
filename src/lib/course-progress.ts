"use client";

import { useSyncExternalStore } from "react";
import { medalFor, type Medal } from "./medals";

/**
 * How far this browser has got through the ladder.
 *
 * ── Why the picker can show a best time and the page cannot ──────────────
 *
 * `/parkour` is a server component and its comment says plainly why personal
 * bests are not on it: they live in `localStorage` per world, so rendering
 * them server-side would mean a client component that flashes empty on every
 * load. That argument was right when the card had nothing else to say.
 *
 * It stops being right at twenty-three courses. A ladder of twenty-three
 * identical cards is a wall, and the one thing that turns it back into a
 * ladder is which ones you have done — so the bests come to the page after
 * all, but as a component that reads them synchronously on first paint rather
 * than as an effect that fills them in afterwards. Nothing flashes, because
 * nothing is rendered twice: the server sends the card, and the badge inside
 * it is empty on the server and correct on the client's first render.
 *
 * ── One read for the whole ladder ────────────────────────────────────────
 *
 * Twenty-three components each doing their own `getItem` in their own
 * subscription is twenty-three snapshots to keep stable. This reads every key
 * once, caches the result, and invalidates on a write — so a card is a lookup
 * in a map that was already built.
 */

/** The key `play/course.ts` writes a personal best under. Read-only here. */
const bestKeyFor = (slug: string) => `blockworld:best:${slug}`;

export interface CourseProgress {
  /** Best time in ms, or null if this browser has never finished it. */
  bestMs: number | null;
  /** The medal that time earns, or null. Derived, never stored. */
  medal: Medal | null;
}

const listeners = new Set<() => void>();

/**
 * Snapshot identity has to be stable, or `useSyncExternalStore` re-renders
 * forever. `version` is bumped by the invalidator below and is the only thing
 * that rebuilds the map.
 */
let version = 0;
let cache: { version: number; value: ReadonlyMap<string, CourseProgress> } | null =
  null;

const EMPTY: ReadonlyMap<string, CourseProgress> = new Map();

function build(slugs: readonly string[]): ReadonlyMap<string, CourseProgress> {
  const out = new Map<string, CourseProgress>();
  for (const slug of slugs) {
    let bestMs: number | null = null;
    try {
      const raw = localStorage.getItem(bestKeyFor(slug));
      const ms = raw === null ? NaN : Number(raw);
      if (Number.isFinite(ms) && ms > 0) bestMs = ms;
    } catch {
      // No storage. Every course reads as unplayed, which is the same thing
      // the page shows a first-time visitor.
      bestMs = null;
    }
    out.set(slug, {
      bestMs,
      medal: bestMs === null ? null : medalFor(slug, bestMs),
    });
  }
  return out;
}

/**
 * The slugs this hook reports on, fixed for the life of the page.
 *
 * Passed in rather than imported, because the ladder is the caller's business
 * — and `built-in-worlds` is exactly the heavy import this file should not be
 * making on the client.
 */
export function useCourseProgress(
  slugs: readonly string[]
): ReadonlyMap<string, CourseProgress> {
  const key = slugs.join(",");
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      if (cache && cache.version === version && cache.value.size === slugs.length) {
        return cache.value;
      }
      const value = build(slugs);
      cache = { version, value };
      return value;
    },
    () => EMPTY
  );
  // `key` is unused at runtime and deliberately not a dependency: this is not
  // a memo, and the snapshot above already rebuilds when the slug count moves.
  void key;
}

/**
 * Tell the ladder a best time changed.
 *
 * Called from the finish panel's own write path would be ideal; it is not
 * wired there, because `play/course.ts` writes during a run and this page is
 * not mounted then. The `storage` event covers another tab, and a navigation
 * back to the ladder remounts and re-reads. This exists for the one case that
 * is neither — a future in-page write — and for the tests.
 */
export function invalidateCourseProgress(): void {
  version++;
  for (const fn of listeners) fn();
}

/** How many of these courses have earned a medal. */
export function medalledCount(
  progress: ReadonlyMap<string, CourseProgress>
): number {
  let n = 0;
  for (const p of progress.values()) if (p.medal !== null) n++;
  return n;
}
