import type { CapacitorConfig } from "@capacitor/cli";

import { ANDROID_APP_UA_TOKEN } from "./src/lib/capacitor-identity";

/**
 * The Capacitor wrapper.
 *
 * This is the second Android distribution, beside the Bubblewrap TWA in
 * `android/`. They are different apps with different package ids and they can
 * sit on the same device at once; nothing here touches the TWA, and
 * `docs/ANDROID.md` §0 still records why the TWA is the one to prefer on this
 * workload. Read `docs/CAPACITOR.md` for what this one is and what it costs.
 *
 * ── The three decisions that matter ──────────────────────────────────────
 *
 * **1. No `server.url`.** Capacitor's own documentation says the option is
 * "intended for use with live-reload servers" and "not intended for use in
 * production", and store reviewers treat a binary that ships one as a thin
 * wrapper. So the app boots from its own bundled files — `webDir` below —
 * and reaches the live site by navigating to it, which is an ordinary
 * in-WebView navigation rather than a configured remote origin.
 *
 * **2. `webDir` is a shell, not the app.** The usual Capacitor answer is to
 * bundle a static export, and this app has none to bundle: Clerk renders
 * session state into the document, worlds come from Neon through `/api/`,
 * `/download` is `force-dynamic`, and races run through a Colyseus room.
 * What is bundled instead is the smallest thing that is honest offline — a
 * launch shell and an error page — so a dropped connection is a page that
 * explains itself rather than the white screen that gets wrappers rejected.
 *
 * **3. The native project is NOT in `android/`.** That directory holds the
 * TWA's Bubblewrap project and its signing keystore. `npx cap add android`
 * would generate over the top of it. `android.path` puts this one somewhere
 * of its own.
 */
const config: CapacitorConfig = {
  appId: "com.specdrivengames.webview",
  appName: "Spec Driven Games",
  webDir: "capacitor/www",

  android: {
    /**
     * Not `android/`. See decision 3 above — that path is the TWA's, and
     * overwriting it would take `release.keystore` with it.
     */
    path: "capacitor-android",

    /**
     * The WebView's own background, behind whatever is loading in it.
     *
     * The same value as the splash and the shell, and the reason the handoff
     * in `capacitor/www/index.html` can be careless about timing: every layer
     * the player could be looking at mid-launch is this colour, so there is
     * no order of events that produces a flash of white.
     */
    backgroundColor: "#1a1d21",

    webContentsDebuggingEnabled: false,
  },

  /**
   * How the site knows it is inside this app.
   *
   * The TWA is recognised by its `android-app://` launch referrer, which
   * Chrome sets and a WebView does not — so inside Capacitor that check
   * answers "no" and `AdSlot` would render AdSense inside a WebView. That is
   * the one thing in this whole wrapper that is a policy violation rather
   * than a preference: Google has terminated accounts for it under "Valuable
   * Inventory: Framed Sites". Appending a token to the user agent gives the
   * client a signal that survives navigation to the live origin, where the
   * Capacitor bridge is not injected and `window.Capacitor` does not exist.
   *
   * See `src/lib/app-mode.ts` for how it is read and what it is allowed to
   * decide (presentation, and nothing else).
   */
  appendUserAgent: ANDROID_APP_UA_TOKEN,

  server: {
    /**
     * Shown when a navigation fails — which, for an app whose content is a
     * live site, is the offline case. Without it a lost connection is a blank
     * white WebView, the single most cited reason a wrapped site is rejected
     * under the minimum-functionality policy.
     */
    errorPath: "offline.html",

    /**
     * Keeps our own domain inside the app. Without it the first navigation
     * off the bundled shell opens the system browser and the app is an empty
     * frame around a launcher icon.
     *
     * Our hosts, and Clerk's. Clerk sends a fresh visitor through its own
     * domain and straight back — a development instance does it on every
     * first load (`*.clerk.accounts.dev`), a production one through
     * `clerk.` / `accounts.` on our domain. A redirect to a host not on this
     * list is handed to the system browser, so without these the app opened
     * Chrome, with its URL bar, on launch and was left on "Starting…".
     *
     * Anything else — Discord, an ad click-through, Google's own sign-in
     * page, which refuses to run inside a WebView — should leave.
     */
    allowNavigation: [
      "specdrivengames.com",
      "www.specdrivengames.com",
      "clerk.specdrivengames.com",
      "accounts.specdrivengames.com",
      "*.clerk.accounts.dev",
      "*.accounts.dev",
    ],

    /**
     * Never true. `cleartext` and `allowMixedContent` are development flags;
     * the site is HTTPS and an app that permits plaintext is an app that can
     * be downgraded on a hostile network.
     */
    cleartext: false,
  },

  plugins: {
    SplashScreen: {
      /**
       * Hidden by the shell once the live site has actually painted, not on a
       * timer — see `capacitor/www/index.html`. `launchAutoHide: false` is
       * what hands that decision to us; left true, the splash disappears on a
       * fixed schedule and the first thing a player sees on a slow connection
       * is the empty frame behind it.
       */
      launchAutoHide: false,
      backgroundColor: "#1a1d21",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },

    StatusBar: {
      /**
       * The site's own theme colour, matching `twa-manifest.json`. The game
       * draws its own HUD to the edges, so the bars are chrome that should
       * disappear into it rather than frame it.
       */
      backgroundColor: "#1a1d21",
      style: "DARK",
      overlaysWebView: true,
    },
  },
};

export default config;
