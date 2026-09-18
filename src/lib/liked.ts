"use client";

import { useSyncExternalStore } from "react";

/**
 * Which games this browser has liked, mirrored locally.
 *
 * ── Why the hearts do not wait for the network ───────────────────────────
 *
 * The batch stats call gives a card its counts, and it is one request for a
 * page of thirty cards — which means every heart would be grey for as long as
 * that request takes, and then a handful of them would turn red. A control
 * flipping state a second after paint reads as the page changing its mind,
 * and on a slow connection it reads as a bug.
 *
 * So liked-ness is a local fact, read synchronously on first paint, and the
 * server is told about changes rather than asked about them. It can be a
 * local fact honestly: the identity behind a like is a per-browser UUID (see
 * `lib/anon-id.ts`), so there is no second device whose answer this could
 * disagree with.
 *
 * The one thing it costs is a like made on this browser and then cleared with
 * the site data, which the server still holds. The heart comes back grey and
 * pressing it is a no-op that returns the same count — which is the correct
 * outcome, just arrived at without the player noticing.
 *
 * Read with `useSyncExternalStore` per CLAUDE.md, and empty on the server so
 * the first client render cannot be a hydration mismatch.
 */

const KEY = "sdg_likes";

const listeners = new Set<() => void>();

/**
 * Parsed once per distinct raw string.
 *
 * `useSyncExternalStore` calls the snapshot on every render and compares by
 * identity, so returning a freshly-built Set each time is an infinite render
 * loop rather than a slow one. The cache is what makes the snapshot stable.
 */
let cache: { raw: string | null; value: ReadonlySet<string> } | null = null;

const EMPTY: ReadonlySet<string> = new Set();

function read(): ReadonlySet<string> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;

  let value: ReadonlySet<string> = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        value = new Set(parsed.filter((s): s is string => typeof s === "string"));
      }
    } catch {
      // Malformed storage is treated as no likes rather than as an error.
      // Somebody edited it, or a half-written value survived a crash; either
      // way the recovery is the same and the next like rewrites the key.
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

/** Whether this browser has liked `slug`, outside React. */
export function hasLiked(slug: string): boolean {
  if (typeof window === "undefined") return false;
  return read().has(slug);
}

/**
 * Record or clear a like locally.
 *
 * Called before the request goes out — the badge updates optimistically and
 * reverts on a non-2xx, which means this has to be the thing that moves
 * first and the thing that moves back.
 */
export function setLikedLocally(slug: string, liked: boolean): void {
  let next: string[];
  try {
    const current = new Set(read());
    if (liked) current.add(slug);
    else current.delete(slug);
    next = [...current];
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // No storage: the heart still moves for this page view, because the
    // component holds its own optimistic state. It simply will not be
    // remembered, which is the documented behaviour of a private window.
    return;
  }
  for (const fn of listeners) fn();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // A like in another tab should move the heart in this one. The `storage`
  // event fires only in the tabs that did not write, which is exactly the set
  // that needs telling.
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useLiked(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
