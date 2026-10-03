"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HeroSky } from "./HeroSky";

/**
 * Browser-only mount for the landing hero.
 *
 * Same reason as EditorMount and PlayMount: `next/dynamic` with `ssr: false`
 * is only legal inside a Client Component. It matters more here than
 * elsewhere, though — this is a marketing page, and three.js has no business
 * blocking its first paint. The placeholder holds the layout so the page does
 * not jump when the canvas arrives, and it is the same sky the canvas is
 * drawn over, so the hand-off is the island appearing and nothing else.
 *
 * ── Why it waits for the page to finish first ────────────────────────────
 *
 * `ssr: false` keeps three.js out of the HTML, but on its own the import
 * still fires during hydration, and on a mid-range phone that put the
 * renderer's setup and every shader compile in the same few seconds as the
 * page becoming tappable: Lighthouse measured 12 s of blocking time on `/`,
 * and real visitors a p75 INP of 3 s. The sky is already painted and the
 * games are under it, so nothing is lost by letting the page load, settle,
 * and then fetching the island in an idle moment.
 */
const HeroCanvas = dynamic(() => import("./HeroCanvas"), {
  ssr: false,
  loading: () => <HeroPlaceholder />,
});

export function HeroPlaceholder() {
  return (
    <div className="hero-sky flex h-[55dvh] max-h-[34rem] min-h-[min(20rem,55dvh)] w-full items-center justify-center">
      <HeroSky />
      <span className="border-accent h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  );
}

type IdleScheduler = (cb: () => void, opts?: { timeout: number }) => number;

/** Calls `fn` once the page has loaded and the main thread has a gap. */
function afterLoadAndIdle(fn: () => void): () => void {
  let cancelled = false;
  let handle = 0;
  let timer = 0;
  const ric: IdleScheduler | undefined =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback.bind(window)
      : undefined;

  const idle = () => {
    if (cancelled) return;
    if (ric) handle = ric(() => !cancelled && fn(), { timeout: 2500 });
    // Safari has no idle callback; a short beat after `load` does the job.
    else timer = window.setTimeout(() => !cancelled && fn(), 300);
  };

  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener("load", idle);
    window.cancelIdleCallback?.(handle);
    window.clearTimeout(timer);
  };
}

export function HeroMount() {
  const [go, setGo] = useState(false);
  useEffect(() => afterLoadAndIdle(() => setGo(true)), []);
  return go ? <HeroCanvas /> : <HeroPlaceholder />;
}
