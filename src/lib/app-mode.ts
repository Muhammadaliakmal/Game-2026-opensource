"use client";

/**
 * Is this page being rendered inside the Android app?
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

const KEY = "sdg-android-app";
const REFERRER = `android-app://${ANDROID_PACKAGE_ID}`;

export function isAndroidApp(): boolean {
  if (typeof document === "undefined") return false;

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
