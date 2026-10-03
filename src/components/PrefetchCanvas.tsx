"use client";

import { useEffect } from "react";
import { connectionHint, shouldPrefetch } from "@/lib/prefetch";

/**
 * Fetch the game's biggest chunks while the player is still choosing.
 *
 * ── The waterfall this removes ───────────────────────────────────────────
 *
 * Every canvas is mounted with `next/dynamic` and `ssr: false`, which is
 * correct — an R3F tree cannot be server-rendered — and has one expensive
 * consequence: because the component never renders on the server, its chunk is
 * not in the HTML. Measured on `/race/<code>`, the served markup references
 * about 880 kB of chunks and *none* of the three big ones. three.js, Rapier
 * and the canvas itself are discovered only after the app has downloaded,
 * parsed and hydrated, so the download that matters starts last:
 *
 *   html -> app js -> hydrate -> discover canvas chunk -> 1.1 MB gz -> wasm
 *
 * Nothing about that order is required. The bytes are identical whenever they
 * are fetched, and the browser is idle for most of the time somebody spends on
 * a lobby screen deciding which course to play. Starting the fetch there turns
 * the last step of the waterfall into something that already happened.
 *
 * ── Why on idle, and why guarded ─────────────────────────────────────────
 *
 * `requestIdleCallback` so it cannot compete with the page it was mounted on —
 * a prefetch that delays the screen the visitor is actually looking at has
 * made things worse in exchange for making them better later. The 2-second
 * timeout is there because an idle callback on a busy page may otherwise never
 * run at all.
 *
 * The connection guard is in `lib/prefetch.ts` with its reasoning. Short
 * version: Data Saver means no, and so does anything slower than 4g.
 *
 * ── What it does not do ──────────────────────────────────────────────────
 *
 * ── Idle, or on intent ───────────────────────────────────────────────────
 *
 * An `import()` does not just download, it *runs* the modules: three, drei,
 * Rapier and the world canvas, top to bottom. Measured on `/` under a
 * phone-class CPU that was a single 3.1-second task, and a tap that lands in
 * it waits for the end of it — which is what interaction latency (INP)
 * measures, and the home page's was 3 s at p75.
 *
 * On a screen that is all 3D games (`/parkour`, `/race`) that cost is going
 * to be paid anyway, so `on="idle"` (the default) is right. On a hub that
 * also lists the 2D arcade (`/`, `/games`, `/browse`) most visitors never
 * open a 3D game, and they were all paying it. `on="intent"` waits for the
 * first sign of heading into one — a pointer over, a touch on or focus on a
 * link into Play or the parkour ladder — which still starts the download
 * well before the navigation does.
 *
 * It does not help somebody who opens a `/race/<code>` link directly — there
 * is no earlier page to prefetch from, and the honest answer for that path is
 * that the chunk has to be fetched then. It helps the ordinary route through
 * the site, which is the one a first-time visitor and a reviewer both take:
 * home, a mode screen, then a game.
 */

/**
 * The module specifiers must match the ones the mounts use, or the bundler
 * produces a second chunk and this downloads a copy of everything for nothing.
 * They resolve to the same files `WorldMount` and `RaceMount` import.
 */
const LOADERS = {
  world: () => import("@/components/world/WorldCanvas"),
  race: () => import("@/components/race/RaceCanvas"),
} as const;

export type CanvasKind = keyof typeof LOADERS;

/** The shape of `requestIdleCallback`, for the browsers that have one. */
type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => number;

/** Links whose destination mounts the world canvas. */
const INTO_A_WORLD = 'a[href^="/play/"], a[href="/parkour"], a[href^="/parkour?"]';

export function PrefetchCanvas({
  kind,
  on = "idle",
}: {
  kind: CanvasKind;
  on?: "idle" | "intent";
}) {
  useEffect(() => {
    if (!shouldPrefetch(connectionHint())) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      // Failure is not worth reporting: this is speculative work, and the real
      // import will surface any genuine problem when the player presses play.
      void LOADERS[kind]().catch(() => {});
    };

    if (on === "intent") {
      const events = ["pointerover", "touchstart", "focusin"] as const;
      const opts = { capture: true, passive: true } as const;
      const stop = () => events.forEach((t) => document.removeEventListener(t, onIntent, opts));
      function onIntent(e: Event) {
        const el = e.target as Element | null;
        if (!el?.closest?.(INTO_A_WORLD)) return;
        stop();
        run();
      }
      events.forEach((t) => document.addEventListener(t, onIntent, opts));
      return () => {
        cancelled = true;
        stop();
      };
    }

    // Captured as possibly-undefined on purpose: `lib.dom` declares
    // `requestIdleCallback` unconditionally, so a plain `if (window.rIC)` is a
    // condition TypeScript knows is always true — and is false on Safari,
    // which is most of the phones this has to be right on.
    const ric: IdleScheduler | undefined =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback.bind(window)
        : undefined;

    // A timeout is a poor substitute for "when the main thread is free", but a
    // much better one than not prefetching at all on every iPhone.
    if (!ric) {
      const timer = window.setTimeout(run, 1200);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const handle = ric(run, { timeout: 2000 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback?.(handle);
    };
  }, [kind, on]);

  return null;
}
