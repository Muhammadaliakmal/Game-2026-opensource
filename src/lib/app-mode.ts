"use client";

/**
 * Is this page being rendered inside the Android app?
 *
 * "The Android app" is now two apps — the Bubblewrap TWA and the Capacitor
 * WebView wrapper — and they announce themselves in two different ways,
 * because they are two different renderers. Both are checked here so callers
 * keep asking one question. See `capacitor-identity.ts` for the second
 * signal and why the first one cannot serve for both.
 *
 * ── The signal ───────────────────────────────────────────────────────────
 *
 * A Trusted Web Activity is Chrome, launched by an Android app, so there is
 * no user-agent difference to look for and nothing on the request says which
 * it is. What Chrome does set is the referrer of the launch navigation:
 * `android-app://<package id>`. That is the documented way an origin learns it
 * was opened by an installed app rather than typed into a browser.
 *
 * The package id is checked rather than just the scheme. Any app can launch a
 * URL and set that referrer; only ours can set that referrer with our package
 * id, and the asset-link file is what makes the pairing verifiable. It costs
 * one `startsWith` and it means a third-party app embedding this site cannot
 * turn features on by pretending to be the app.
 *
 * ── Why it is remembered ─────────────────────────────────────────────────
 *
 * `document.referrer` belongs to the document, and client-side navigation in a
 * Next app does not make a new one — so it survives every in-app route change
 * for free. What it does not survive is a *reload*, which replaces the
 * document with one whose referrer is empty. Session storage carries it across
 * that; it is scoped to the tab, so it cannot leak into an ordinary browser
 * session later.
 *
 * ── What this is NOT for ─────────────────────────────────────────────────
 *
 * Not authentication, and not anything a server decides. It is read only by
 * client components, and only to answer presentation questions — see AdSlot
 * for the one that matters. A server-rendered branch on this would mean
 * reading a cookie in the root layout, which opts the whole site out of static
 * rendering; the pages this affects are the prose pages an indexer reads, and
 * making all of them dynamic to hide an advert would be a bad trade.
 */

import { ANDROID_PACKAGE_ID } from "./android";
import { ANDROID_APP_UA_TOKEN, APP_BUILD_UA_PREFIX } from "./capacitor-identity";
import { APP_SESSION_KEY as KEY } from "./app-shell";
const REFERRER = `android-app://${ANDROID_PACKAGE_ID}`;

/**
 * The Capacitor build, which carries its token on the user agent rather than
 * on a referrer.
 *
 * Checked before the referrer because it is the cheaper and more durable of
 * the two: the user agent belongs to the WebView, so it is already correct on
 * a reload, on a deep link and on the first document, and needs none of the
 * session-storage carrying the referrer does.
 */
function isCapacitorApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(ANDROID_APP_UA_TOKEN);
}

/**
 * The Capacitor app's installed versionCode, or null outside it.
 *
 * Pure over its argument so it can be tested without a browser; callers pass
 * `navigator.userAgent`.
 */
export function capacitorBuild(userAgent: string): number | null {
  if (!userAgent.includes(ANDROID_APP_UA_TOKEN)) return null;
  const i = userAgent.indexOf(APP_BUILD_UA_PREFIX);
  if (i < 0) return 1;
  const n = parseInt(userAgent.slice(i + APP_BUILD_UA_PREFIX.length), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * True only inside the Capacitor WebView build — the one place ads must not
 * load. AdSense in a bare WebView is the "Valuable Inventory: Framed Sites"
 * violation (docs/CAPACITOR.md §5). The TWA is NOT this: it is Chrome itself
 * rendering the site, AdSense treats it as the website, and the Play listing
 * declares "Contains ads" for it (6 Oct 2026). Ads gate on this, not on
 * `isAndroidApp()`.
 */
export function isWebViewApp(): boolean {
  return isCapacitorApp();
}

export function isAndroidApp(): boolean {
  if (typeof document === "undefined") return false;

  if (isCapacitorApp()) return true;

  if (document.referrer.startsWith(REFERRER)) {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      // Private mode, or storage disabled. The referrer check still answers
      // correctly for this document; only the reload case is lost.
    }
    return true;
  }

  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
