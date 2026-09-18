"use client";

import { useSyncExternalStore } from "react";

/**
 * What this browser has played, newest first.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Most visits are return visits, and a returning player does not want a
 * menu — they want the thing they were doing. One chip at the top of the
 * games hub, "Continue · Sky Yard", is the shortest path there is, and the
 * "Jump back in" rail under the fold is the next six.
 *
 * Recorded by `<RememberPlay>` from the screens that ARE a game: a world in
 * play, a race grid, an arcade cabinet. Never from a lobby, because
 * "Continue · Race" landing on a page that asks which track is not
 * continuing anything. Read with `useSyncExternalStore`, per CLAUDE.md, and
 * empty on the server so nothing hydrates as a mismatch.
 *
 * ── Why it is local and stays local ──────────────────────────────────────
 *
 * This is a list of what somebody has been playing, which is the most
 * personal thing the site could hold about a visitor who has not signed in.
 * It never leaves the browser, is never sent with a request, and is not the
 * anonymous id — that is a separate value with a separate job (`lib/anon-id`).
 */
export interface LastPlayed {
  href: string;
  title: string;
  /** What kind of thing it was, for the chip's label. */
  kind: "world" | "race" | "arcade";
  /**
   * The `content/registry` slug, when this is a registry entry.
   *
   * Optional because a world somebody published is not one, and because the
   * race grid is recorded against the lobby rather than a room code. It is
   * what lets the rail show a personal best beside the name.
   */
  slug?: string;
}

/** One row as it is stored: what was played, and when. */
export interface RecentPlay extends LastPlayed {
  /** ms since epoch, for ordering. Never displayed. */
  at: number;
}

/** From the spec. Six is two rows of three, and one screenful of rail. */
export const MAX_RECENT = 6;

const KEY = "blockworld:recent:v1";
/** The single-entry key this replaced. Read once, to migrate, never written. */
const LEGACY_KEY = "blockworld:last-played:v1";

const listeners = new Set<() => void>();

/**
 * Parsed once per distinct raw string.
 *
 * `useSyncExternalStore` calls the snapshot on every render and compares by
 * identity, so returning a fresh array each time is an infinite render loop
 * rather than a slow one.
 */
let cache: { raw: string | null; value: readonly RecentPlay[] } | null = null;

const EMPTY: readonly RecentPlay[] = [];

function isKind(k: unknown): k is LastPlayed["kind"] {
  return k === "world" || k === "race" || k === "arcade";
}

/**
 * One stored row, or null.
 *
 * Every field is checked rather than trusted. A stored value is something a
 * previous version of this app wrote, something a player edited, or something
 * left over from a shape that no longer exists — a `kind` of "arena" was a
 * real one of those, and it is rejected here like any other stale value.
 */
function parseRow(v: unknown): RecentPlay | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Partial<RecentPlay>;
  if (typeof r.href !== "string" || !r.href.startsWith("/")) return null;
  if (typeof r.title !== "string" || !isKind(r.kind)) return null;
  return {
    href: r.href,
    title: r.title,
    kind: r.kind,
    slug: typeof r.slug === "string" ? r.slug : undefined,
    at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0,
  };
}

function read(): readonly RecentPlay[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;

  let value: readonly RecentPlay[] = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        value = parsed
          .map(parseRow)
          .filter((r): r is RecentPlay => r !== null)
          .slice(0, MAX_RECENT);
      }
    } catch {
      value = EMPTY;
    }
  } else {
    // Nothing under the new key. Somebody who has been playing since before
    // the rail existed still has one entry under the old one, and their
    // Continue chip should not disappear the day this shipped.
    value = readLegacy();
  }

  cache = { raw, value };
  return value;
}

function readLegacy(): readonly RecentPlay[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return EMPTY;
    const row = parseRow(JSON.parse(raw));
    return row ? [row] : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * Record a play, moving it to the front.
 *
 * Deduplicated by `href`, so replaying one course ten times leaves one row
 * rather than filling the rail with it — which is the difference between a
 * list of what you have been playing and a list of the last thing you played,
 * six times.
 */
export function rememberPlay(entry: LastPlayed) {
  const row: RecentPlay = { ...entry, at: Date.now() };
  try {
    const next = [row, ...read().filter((r) => r.href !== entry.href)].slice(
      0,
      MAX_RECENT
    );
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return;
  }
  for (const fn of listeners) fn();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Everything this browser has played, newest first. */
export function useRecentPlays(): readonly RecentPlay[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** The newest one, or null. What the Continue chip shows. */
export function useLastPlayed(): LastPlayed | null {
  const recent = useRecentPlays();
  return recent.length > 0 ? recent[0] : null;
}
