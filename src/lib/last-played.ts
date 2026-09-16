"use client";

import { useSyncExternalStore } from "react";

/**
 * The last game somebody opened, so the front page can offer it back.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Most visits are return visits, and a returning player does not want a
 * menu — they want the thing they were doing. One chip at the top of the
 * games hub, "Continue · Sky Yard", is the shortest path there is, and it
 * costs one localStorage key.
 *
 * Recorded by `<RememberPlay>` from the screens that ARE a game: a world in
 * play, a race grid, a match, an arcade cabinet. Never from a lobby, because
 * "Continue · Race" landing on a page that asks which track is not
 * continuing anything. Read with `useSyncExternalStore`, per CLAUDE.md, and
 * `null` on the server so the chip never hydrates as a mismatch.
 */
export interface LastPlayed {
  href: string;
  title: string;
  /** What kind of thing it was, for the chip's label. */
  kind: "world" | "race" | "arcade";
}

const KEY = "blockworld:last-played:v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: LastPlayed | null } | null = null;

function read(): LastPlayed | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: LastPlayed | null = null;
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<LastPlayed>;
      if (
        typeof v.href === "string" &&
        v.href.startsWith("/") &&
        typeof v.title === "string" &&
        (v.kind === "world" || v.kind === "race" || v.kind === "arcade")
      ) {
        value = { href: v.href, title: v.title, kind: v.kind };
      }
    } catch {
      value = null;
    }
  }
  cache = { raw, value };
  return value;
}

export function rememberPlay(entry: LastPlayed) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry));
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

export function useLastPlayed(): LastPlayed | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
