"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AD_CLIENT, AD_SLOTS, type AdPlacement } from "@/lib/ads";
import { isAndroidApp } from "@/lib/app-mode";

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
 * ── Never inside the Android app ─────────────────────────────────────────
 *
 * The app is a Trusted Web Activity, so this markup runs in the user's own
 * Chrome and AdSense's WebView rules — the ones that require registering a
 * `WebView` with the Google Mobile Ads SDK — are about a different thing. An
 * ad here would not be policy-breaking. It is still wrong, for the reason
 * `lib/ads.ts` already gives about sessions: the app is fullscreen by
 * manifest, with the thumb controls at the edges of the same viewport, and an
 * advert in a frame somebody is tapping at speed generates the kind of clicks
 * that close a publisher account rather than pay it. The app is also the one
 * surface whose ad behaviour has to be declared on a Play Data safety form and
 * defended at review, and "there are none" is the answer that stays true.
 *
 * This is the gate rather than a rule about which routes mount an `AdSlot`,
 * because the gate has to hold for placements that do not exist yet.
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

/**
 * Whether this is the app never changes under a running page, so there is
 * nothing to subscribe to — but it is still read from outside React, and the
 * `set-state-in-effect` rule rejects the effect-and-setState form. The server
 * snapshot is `false` because the server genuinely cannot know; the client
 * corrects it before anything is requested, which is the half that matters.
 */
const subscribeNever = () => () => {};
const notAppOnServer = () => false;

export function AdSlot({
  placement,
  className,
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const slot = AD_SLOTS[placement];
  const inApp = useSyncExternalStore(subscribeNever, isAndroidApp, notAppOnServer);
  const pushed = useRef(false);

  useEffect(() => {
    if (!slot || inApp || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Blocked, stubbed, or already filled. An advert is never worth an
      // error boundary — the page it sits on is the product.
    }
  }, [slot, inApp]);

  // No slot id yet (see lib/ads), or this is the Android app. Render nothing at
  // all rather than an empty bordered box: a placeholder that never fills is
  // worse than no placeholder.
  if (!slot || inApp) return null;

  return (
    <ins
      // The literal class is the hook AdSense scans for; the rest is layout.
      className={`adsbygoogle${className ? ` ${className}` : ""}`}
      /*
       * A reserved band, so the ad does not push the page down when it fills.
       *
       * `data-ad-format="auto"` means the unit decides its own height at fill
       * time, which is some hundreds of milliseconds after the content around
       * it has painted. With nothing reserved, that is a block of zero height
       * becoming a block of 250, and everything below it moving — a layout
       * shift, at the bottom of a page somebody is reading.
       *
       * On this site that is not only a polish question. Cumulative Layout
       * Shift is a Core Web Vital, it is currently in the "poor" band, and an
       * ad unit is the single most common cause of a bad one.
       *
       * The number is the reservation, not a promise: a responsive unit can
       * still come back taller, and what is left is a small shift instead of a
       * whole-screen one. 280 on a phone and 250 above it are the heights the
       * auto format actually picks most of the time. `min-height` rather than
       * `height` so a taller fill is never clipped — a clipped ad is not
       * served, and an ad that is not served is not paid for.
       *
       * Both slots are empty today (`lib/ads.ts`), so nothing renders and
       * nothing shifts. This is here so that the day a slot id is pasted in is
       * not the day CLS regresses.
       */
      style={{ display: "block", minHeight: "var(--ad-min-h, 250px)" }}
      data-ad-client={AD_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
