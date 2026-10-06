/**
 * The app shell: what changes about the site when it is the Android app.
 *
 * `app-mode.ts` answers "is this the app?" for client components, and was
 * used for one thing — hiding ads. Everything else about the page stayed a
 * website: the light theme, breadcrumbs, a footer of legal links, paragraphs
 * written for a search engine, text that selects on a long press. Inside a
 * fullscreen TWA that is what made the app feel like a browser with the bar
 * taken off rather than a game.
 *
 * The answer here is an attribute, `<html data-app>`, written by an inline
 * script before the first paint, and everything else is CSS (globals.css,
 * "The app shell"). Before the first paint for the same reason the theme is:
 * a header painted and then removed is a visible jump, and a light page that
 * turns dark is worse.
 *
 * ── What counts as the app ───────────────────────────────────────────────
 *
 * The same signals `isAndroidApp()` reads — the TWA's `android-app://`
 * launch referrer, carried across reloads in session storage under the SAME
 * key, and the Capacitor build's user-agent token — plus `display-mode`
 * fullscreen/standalone, so an installed PWA gets the shell too. That last
 * one deliberately does NOT feed `isAndroidApp()`: a PWA is still the website
 * as far as ads and the Play Data safety form are concerned, and only the
 * look is shared.
 *
 * ── The theme ────────────────────────────────────────────────────────────
 *
 * Games here are always dark (see CLAUDE.md, "Light theme"), and the app is a
 * game, so in the app "Auto" means dark. An explicit Light choice is still
 * honoured. `theme.ts` asks `appShellDark()` so that a device flipping its
 * system theme mid-session cannot turn the app light again.
 *
 * Pure and import-light on purpose: the layout (a server component) reads
 * the script string, and `theme.ts` reads the attribute.
 */

import { ANDROID_PACKAGE_ID } from "./android";
import { ANDROID_APP_UA_TOKEN } from "./capacitor-identity";

/** Shared with `app-mode.ts`, which writes the same flag. */
export const APP_SESSION_KEY = "sdg-android-app";

/** The attribute on `<html>` the CSS keys off. */
export const APP_ATTR = "data-app";

/**
 * Runs in <head> AFTER `THEME_INIT_SCRIPT`, so it can override the theme the
 * first script resolved. The theme key and colour are passed in rather than
 * imported, which keeps this module free of `theme.ts` (which imports it).
 */
export function appShellInitScript(themeKey: string, darkColor: string): string {
  const j = JSON.stringify;
  return `(function(){try{var d=document.documentElement,a=false;if(navigator.userAgent.indexOf(${j(
    ANDROID_APP_UA_TOKEN
  )})>=0)a=true;else if((document.referrer||"").indexOf(${j(
    `android-app://${ANDROID_PACKAGE_ID}`
  )})===0)a=true;else{try{a=sessionStorage.getItem(${j(APP_SESSION_KEY)})==="1"}catch(e){}}var s=matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: standalone)").matches;if(!a&&!s)return;if(a){try{sessionStorage.setItem(${j(
    APP_SESSION_KEY
  )},"1")}catch(e){}}d.setAttribute(${j(APP_ATTR)},"");var p=null;try{p=localStorage.getItem(${j(
    themeKey
  )})}catch(e){}if(p!=="light"){d.setAttribute("data-theme","dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",${j(
    darkColor
  )})}}catch(e){}})();`;
}

/** True when the shell is on, which makes "Auto" resolve to dark. */
export function appShellDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(APP_ATTR);
}
