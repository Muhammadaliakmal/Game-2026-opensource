"use client";

import { holdSilence } from "@/lib/audio";
import { isWebViewApp } from "@/lib/app-mode";
import { interstitialAllowed, type AdPacing } from "@/lib/game-ads-policy";

/**
 * Google's H5 Games Ads, through the Ad Placement API: `adBreak()` and
 * `adConfig()`, carried by the same adsbygoogle.js the root layout already
 * loads. See https://developers.google.com/ad-placement/apis.
 *
 * Two placements, and only two:
 *
 *  - **Rewarded** (`offerReward`): opt-in, on the arcade results screen. The
 *    player is offered "double it" for watching an ad, and only if Google has
 *    one to offer — `beforeReward` is what hands us the button, so with no
 *    ad there is no button rather than a button that does nothing.
 *  - **Interstitial** (`breakBeforeRun`): `type: "next"`, between one run and
 *    the next, which is the natural transition the policy names. Paced by
 *    `interstitialAllowed` (lib/game-ads-policy.ts) on top of Google's own
 *    frequency cap.
 *
 * Never in the Android app: the Play listing declares no ads, the same rule
 * `AdSlot` follows. Never during play: nothing here is called while a run is
 * live, and the 3D worlds never call it at all.
 *
 * ── Failing closed, and never stranding the player ───────────────────────
 *
 * An ad blocker stubs or removes adsbygoogle.js. The shim below then pushes
 * into an array nobody reads, so no callback ever fires — and the
 * interstitial sits in front of "Again". So `breakBeforeRun` carries its own
 * deadline: if no ad has started within it, the run starts anyway. The
 * rewarded path needs no deadline, because without a `beforeReward` there is
 * simply no offer on screen.
 */

type PlacementInfo = { breakStatus?: string };

type AdBreakOptions = {
  type: "start" | "pause" | "next" | "browse" | "reward" | "preroll";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: PlacementInfo) => void;
};

type AdConfigOptions = {
  preloadAdBreaks?: "on" | "auto";
  sound?: "on" | "off";
  onReady?: () => void;
};

declare global {
  interface Window {
    adBreak?: (o: AdBreakOptions) => void;
    adConfig?: (o: AdConfigOptions) => void;
  }
}

/** How long an interstitial may take to start before the run goes ahead. */
const START_DEADLINE_MS = 1500;

const pacing: AdPacing = { runs: 0, lastAdAt: null };
let configured = false;

/** Whether this page may show game ads at all. */
function eligible(): boolean {
  return typeof window !== "undefined" && !isWebViewApp();
}

/**
 * Google's shim, verbatim in effect: both functions push their options onto
 * the adsbygoogle queue, which the script drains once it has loaded.
 */
function api(): Pick<Window, "adBreak" | "adConfig"> {
  const w = window as Window & { adsbygoogle?: unknown[] };
  w.adsbygoogle = w.adsbygoogle ?? [];
  if (!w.adBreak || !w.adConfig) {
    const push = (o: unknown) => {
      try {
        w.adsbygoogle!.push(o);
      } catch {
        /* blocked or stubbed: nothing will fire, see above */
      }
    };
    w.adBreak = push;
    w.adConfig = push;
  }
  if (!configured) {
    configured = true;
    // Preload so a rewarded offer can be made the moment a run ends rather
    // than a beat later, once the result is already on screen.
    w.adConfig!({ preloadAdBreaks: "on", sound: "on" });
  }
  return w;
}

/** Count a finished run toward the interstitial's pacing. */
export function noteRunFinished(): void {
  pacing.runs += 1;
}

/**
 * Maybe show an interstitial, then start the next run either way.
 *
 * `next` is called exactly once: after the ad, after Google declines to
 * show one, or after the start deadline if nothing answers at all.
 */
export function breakBeforeRun(next: () => void): void {
  if (!eligible() || !interstitialAllowed(pacing, Date.now())) {
    next();
    return;
  }
  let settled = false;
  let started = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    holdSilence(false);
    next();
  };
  const deadline = window.setTimeout(() => {
    if (!started) finish();
  }, START_DEADLINE_MS);

  api().adBreak!({
    type: "next",
    name: "arcade-again",
    beforeAd: () => {
      started = true;
      pacing.lastAdAt = Date.now();
      holdSilence(true);
    },
    afterAd: () => holdSilence(false),
    adBreakDone: () => {
      window.clearTimeout(deadline);
      finish();
    },
  });
}

export type RewardOffer = {
  /** Show the ad. Call from the press of the offer button. */
  show: () => void;
};

/**
 * Ask Google whether it has a rewarded ad for this moment.
 *
 * `onOffer` fires only if it does, with the function that shows it; the
 * caller renders a button for exactly that long. `onReward` fires only if
 * the ad was watched through (`adViewed`), never on a skip. `onDone` fires
 * when the placement is over by any route, including "no ad was available",
 * and is where the button goes away.
 */
export function offerReward(handlers: {
  onOffer: (offer: RewardOffer) => void;
  onReward: () => void;
  onDone: () => void;
}): void {
  if (!eligible()) return;
  api().adBreak!({
    type: "reward",
    name: "arcade-double-coins",
    beforeReward: (showAdFn) => handlers.onOffer({ show: showAdFn }),
    beforeAd: () => {
      pacing.lastAdAt = Date.now();
      holdSilence(true);
    },
    afterAd: () => holdSilence(false),
    adViewed: () => handlers.onReward(),
    adDismissed: () => {
      /* skipped: no reward, and the placement still ends in adBreakDone */
    },
    adBreakDone: () => {
      holdSilence(false);
      handlers.onDone();
    },
  });
}
