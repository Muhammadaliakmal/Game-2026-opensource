# Producing the Android APK

The APK is **not built by this repo**. It is generated from the *deployed* site
by [PWABuilder](https://www.pwabuilder.com), which wraps the live URL in a
Trusted Web Activity — an Android app whose whole UI is Chrome rendering this
site, with no browser chrome around it.

That is a deliberate choice rather than a shortcut, and the reason is what a TWA
actually is: it renders in the user's own Chrome, so the game gets the same
WebGL and JIT it gets in a tab. A Capacitor or Cordova shell renders in an
Android System WebView instead, which on a mid-range phone is a real frame-rate
loss on exactly the workload this app is — a fragment-bound 3D canvas. The
trade is that a TWA needs the site to be online, which this game does anyway:
worlds live on the server and races run through a room.

## Prerequisites

The site must be **deployed and publicly reachable over HTTPS**. PWABuilder
fetches the URL; it cannot see localhost. It reads:

- `src/app/manifest.ts` → served at `/manifest.webmanifest`
- `public/icons/*` → the launcher icon, including the maskable variant
- `public/sw.js` → a service worker with a `fetch` handler, which is what makes
  the app installable in the first place

All three are in place. Nothing here needs changing between builds.

## Steps

1. Go to <https://www.pwabuilder.com> and enter the deployed URL.
2. Let it run its report. It should find the manifest, the service worker and
   the icons. Warnings about screenshots are cosmetic — they matter for a Play
   Store listing, not for a sideloaded APK.
3. **Package For Stores → Android → Store package**.
4. In the options dialog, the two fields that matter:
   - **Package ID** — reverse-DNS, e.g. `app.blockworld.twa`. This is the app's
     permanent identity on a device. Changing it later installs a *second* app
     beside the first rather than updating it, so decide once.
   - **Signing key** — choose "Create new" for the first build and **keep the
     `.keystore` file and its passwords**. An APK signed with a different key
     cannot upgrade one signed with this one; Android refuses the install and
     the only way out is uninstalling, which takes the user's local data with
     it. Store it somewhere that is not this repo.
5. Download the zip. Inside it:
   - `app-release-signed.apk` — the file to ship for sideloading.
   - `app-release-bundle.aab` — for the Play Store only. Android cannot install
     an `.aab` directly; handing one to someone as a download is the usual way
     this goes wrong.
   - `assetlinks.json` — see below.
6. Rename the APK to `blockworld.apk` and put it at `public/blockworld.apk`.
7. Bump `APK_VERSION` in `src/lib/apk.ts`. The size and build date on the
   `/download` page come off the file itself and need no editing.
8. Deploy.

## Digital Asset Links

The zip contains an `assetlinks.json`. It must be served at:

```
https://<your-domain>/.well-known/assetlinks.json
```

This is what proves the domain and the app belong to the same owner. **Without
it the TWA still runs, but with a browser address bar pinned across the top** —
which on a phone eats the part of the canvas the race HUD uses, and is the
single most common "why does my app look wrong" outcome here.

To serve it from this app, put the file at `public/.well-known/assetlinks.json`.
Next serves `public/` at the root, so no route or rewrite is needed.

The file contains the SHA-256 fingerprint of the signing key. If you ever
re-sign with a new key, this file has to be regenerated too.

## Updating

A TWA has no bundled web content, so shipping game changes does **not** need a
new APK — deploy the site and every installed app has the change on next
launch. Rebuild the APK only when something in the shell itself changes: the
package ID, the launcher icon, the app name, or the manifest's `display` or
`orientation`.

## The alternative worth knowing about

On Android, "Install from the browser" on `/download` produces the same
fullscreen app with the same icon, installed by Chrome, with no sideloading
prompt and no Play Protect warning — and it updates itself. The APK exists for
the cases that cannot use it: distributing a file directly, devices where the
install prompt does not appear, or a build that will eventually go to the Play
Store.
