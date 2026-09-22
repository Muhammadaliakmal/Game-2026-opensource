/**
 * The Capacitor app's identity, in one place — the sibling of `android.ts`.
 *
 * `android.ts` is the TWA's identity and says why one module owning these
 * values matters: the same string is read by a build tool, served to a
 * verifier and typed into a console, at three different times, and a mismatch
 * between any two of them fails silently. The same is true here, across a
 * smaller set:
 *
 * - `capacitor.config.ts`, read by the Capacitor CLI when it generates and
 *   syncs the native project.
 * - `src/lib/app-mode.ts`, read in the browser to decide whether this page is
 *   being rendered inside the app.
 *
 * Pure on purpose. `capacitor.config.ts` is loaded by the Capacitor CLI
 * outside Next, and `app-mode.ts` is a client module, so anything imported
 * here has to be legal in both. No `"use client"`, no `process.env`, no
 * imports.
 */

/**
 * The Capacitor app's package id — deliberately NOT the TWA's.
 *
 * `com.specdrivengames.twa` is spent: it is the id in `twa-manifest.json` and
 * in the asset-link file, and a package id cannot be renamed or reused once
 * published. Giving the WebView build its own id means the two can be
 * installed side by side, compared on the same device, and listed separately
 * — and that an install of one can never be upgraded into the other by
 * accident, which would silently swap the renderer under a player.
 */
export const CAPACITOR_PACKAGE_ID = "com.specdrivengames.app";

/**
 * Appended to the WebView's user agent, and the only way the site can tell it
 * is inside this app.
 *
 * ── Why not the TWA's signal ─────────────────────────────────────────────
 *
 * The TWA is detected by its `android-app://` launch referrer, which Chrome
 * sets when an installed app launches it. A WebView sets no such thing, so
 * that check answers "no" here — and the feature that hangs off it is
 * `AdSlot`, which must render nothing inside a WebView. Showing AdSense in a
 * bare WebView is not a preference, it is the thing Google terminates
 * accounts for under "Valuable Inventory: Framed Sites".
 *
 * ── Why not `window.Capacitor` ───────────────────────────────────────────
 *
 * Because it is not there. The bridge is injected into the bundled origin the
 * app boots from; once the shell navigates to `https://specdrivengames.com`,
 * the pages that actually render the game are an ordinary remote origin with
 * no bridge and no plugins. The user agent is the one signal that crosses
 * that boundary, because it belongs to the WebView rather than to a document.
 *
 * ── What it is NOT ───────────────────────────────────────────────────────
 *
 * Not authentication. A user agent is a string anyone can send, exactly like
 * the referrer the TWA check reads — both answer a presentation question and
 * neither is allowed to decide anything else. See `app-mode.ts`.
 */
export const ANDROID_APP_UA_TOKEN = "SpecDrivenGamesApp/1";

/**
 * The installed build, on the same user agent: `SDGAppBuild/<versionCode>`,
 * appended natively by `MainActivity` from the package's own versionCode so
 * it cannot drift from the binary. Separate from the token above because
 * that one is a presence marker already baked into shipped installs.
 *
 * A Capacitor user agent WITHOUT it is build 1 — the only build that shipped
 * before this existed.
 */
export const APP_BUILD_UA_PREFIX = "SDGAppBuild/";

/**
 * The versionCode of the APK `/download` serves. A sideloaded app never
 * updates itself, so this is what the in-app notice compares against.
 * `npm run cap:release` refuses to publish if it disagrees with
 * `capacitor-android/app/build.gradle`.
 */
export const LATEST_APP_BUILD = 4;

/**
 * The link Chrome uses to hand a sign-in back to the app, after a Google
 * sign-in the WebView cannot do itself (Google refuses to run its sign-in page
 * inside one). `MainActivity` declares the scheme and redeems the ticket.
 *
 * An `intent:` URL naming our package rather than a bare
 * `specdrivengames://` link: a custom scheme can be registered by any app on
 * the phone, and the ticket signs in as the user. With the package named,
 * Chrome delivers it to this app or to nobody.
 */
export const APP_AUTH_SCHEME = "specdrivengames";

export function appAuthIntentUrl(ticket: string): string {
  return (
    `intent://auth?ticket=${encodeURIComponent(ticket)}` +
    `#Intent;scheme=${APP_AUTH_SCHEME};package=${CAPACITOR_PACKAGE_ID};end`
  );
}
