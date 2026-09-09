"use client";

import { useEffect, useRef } from "react";
import { AD_CLIENT, AD_SLOTS, type AdPlacement } from "@/lib/ads";

/**
 * One AdSense display unit.
 *
 * ── Why a client component, and why the push is in an effect ─────────────
 *
 * AdSense fills an `<ins class="adsbygoogle">` that is already in the DOM: the
 * `push({})` is the instruction to go and fill the last one rendered. Doing it
 * during render would run before the element exists on a client navigation and
 * would run on the server, where `window` does not. An effect is the only
 * point where the element is guaranteed to be there.
 *
 * ── The double-push, which is the bug everyone hits ──────────────────────
 *
 * React StrictMode invokes effects twice in development, and AdSense answers
 * the second push with "All 'ins' elements in the body of the page already
 * have ads in them" — thrown, not logged, so it takes the page down with it.
 * The ref survives both invocations and is what makes this idempotent; the
 * try/catch is the floor under it, because the same throw arrives when an ad
 * blocker has stubbed the queue.
 */
declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({
  placement,
  className,
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const slot = AD_SLOTS[placement];
  const pushed = useRef(false);

  useEffect(() => {
    if (!slot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Blocked, stubbed, or already filled. An advert is never worth an
      // error boundary — the page it sits on is the product.
    }
  }, [slot]);

  // No slot id yet (see lib/ads). Render nothing at all rather than an empty
  // bordered box: a placeholder that never fills is worse than no placeholder.
  if (!slot) return null;

  return (
    <ins
      // The literal class is the hook AdSense scans for; the rest is layout.
      className={`adsbygoogle${className ? ` ${className}` : ""}`}
      style={{ display: "block" }}
      data-ad-client={AD_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
