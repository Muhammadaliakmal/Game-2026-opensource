# The Android app

Two distributions, one build: a signed APK on `/download` for anybody who wants
a file, and an AAB on Google Play. Both come out of the same Bubblewrap run and
both are the same thing — a **Trusted Web Activity**, an Android app whose
entire UI is the user's own Chrome rendering this site with no browser chrome
around it.

Status as of **21 September 2026**: the pipeline and everything the app needs
from the site are in place. No build has been produced and no Play account
exists yet.

---

## 0. Why a TWA and not a WebView wrapper

This gets proposed roughly once a quarter, usually as Capacitor, so the
reasoning is written down rather than re-argued.

**A TWA renders in Chrome. A Capacitor or Cordova app renders in Android System
WebView.** Those are different engines with different update cadences on any
given phone, and on the workload this app actually is — a fragment-bound 3D
canvas — that is a real frame-rate difference rather than a theoretical one.
The game gets the same WebGL, the same JIT and the same GPU path it gets in a
tab, because it *is* a tab.

Three things people reach for Capacitor to get, and where they already are:

| Wanted | Where it is |
|---|---|
| Works offline | `public/sw.js` + `/offline.html`. Nothing else could work anyway: worlds live on the server and races run through a room. |
| Hardware back button | Chrome's, for free. A WebView wrapper has to implement this, and not implementing it is a documented Play rejection. |
| Splash screen | `splashScreenFadeOutDuration` in `android/twa-manifest.json`, drawn from the manifest's icon and background colour. |

And the case *against* Capacitor here is stronger than the case for the TWA.
Capacitor's own documentation says `server.url` — pointing the WebView at a
live site — is "intended for use with live-reload servers" and "not intended
for use in production". The supported alternative is bundling a static build
into `webDir`, and **this app has no static build to bundle**: Clerk renders
session state into the document, worlds come from Neon through `/api/`,
`/download` is `force-dynamic`, and races run through a Colyseus room. Taking
the Capacitor path would mean shipping the mode its own docs warn against, in
exchange for a slower renderer.

The trade the TWA makes is that it needs the site to be online. So does the
game.

---

## 1. What the site already provides

Nothing here needs changing between builds. It is listed so that a change to
any of it is recognised as an Android change.

| Thing | Where | What breaks without it |
|---|---|---|
| Web manifest | `src/app/manifest.ts` → `/manifest.webmanifest` | Bubblewrap has no name, icon, colours or orientation to read. |
| Service worker | `public/sw.js` | Chrome will not call the site installable, and the app is not packageable. |
| Icons | `public/icons/*`, `npm run icons:generate` | Launcher icon is letterboxed in a white rounded square on Android 8+. |
| Offline page | `public/offline.html` | A dropped connection is a blank white app. |
| Asset links | `src/app/well-known/assetlinks.json/route.ts` | **A browser address bar pinned over the HUD.** See §4. |
| Shared identity | `src/lib/android.ts` | The package id and fingerprints drift between the build, the served file and the Play Console. |

`display: "fullscreen"` and `orientation: "landscape"` in the manifest are
load-bearing, and the reasons are in that file.

---

## 2. Prerequisites

- **JDK 17+** and the **Android SDK** (command-line tools are enough; Android
  Studio installs both). Bubblewrap offers to download them on first run.
- **Node 22+**, which the repo already needs.
- **The site deployed and publicly reachable over HTTPS.** Bubblewrap fetches
  the manifest over the network; it cannot see localhost.

`bubblewrap` is deliberately not a dependency of this repo — see
`android/README.md`. The npm scripts call it through `npx`.

---

## 3. Building

### First time only

```bash
cd android
npx @bubblewrap/cli init --manifest https://specdrivengames.com/manifest.webmanifest
```

It prompts, then writes a `twa-manifest.json` and an Android project. **The
repo already contains a `twa-manifest.json`** — the answers you want are all in
it, so either give those answers at the prompts or let `init` write its own and
reconcile it against the committed file afterwards. The fields that must match
are `packageId`, `display`, `orientation`, the colours and `signingKey`.

When it asks about the signing key, **create a new one and keep it**:

- Put it at `android/release.keystore` with alias `specdrivengames`, which is
  what the committed manifest and `npm run android:fingerprint` expect.
- It is gitignored, and that is not an oversight. An APK signed with a
  different key cannot upgrade one signed with this one — Android refuses the
  install, and the only way out is uninstalling, which takes the player's local
  data with it.
- **Back it up somewhere that is not this machine and not this repo.** Losing
  it ends the sideloaded distribution permanently. Play is more forgiving; see
  §5.

### Every time after

```bash
npm run android:update    # regenerate the project from twa-manifest.json
npm run android:build     # signed APK + AAB
npm run android:release   # APK -> public/, with its SHA-256
```

`android:build` produces both artifacts:

- `app-release-signed.apk` — the file to ship for sideloading.
- `app-release-bundle.aab` — Play only. **Android cannot install an `.aab`.**
  Handing one to somebody as a download is the usual way this goes wrong.

`android:release` copies the APK to `public/blockworld.apk`, writes
`public/blockworld.apk.sha256` beside it, and **refuses to run if
`appVersionName` in `android/twa-manifest.json` and `APK_VERSION` in
`src/lib/apk.ts` disagree** — that pair going stale is silent, and the symptom
is a page confidently naming the previous version over a new file. Commit both
outputs and deploy; `/download` reads the APK's real size and date off disk.

Bump `appVersionCode` (an integer, +1) and `appVersionName` for every build
that goes anywhere. Play refuses a bundle whose `versionCode` it has already
seen, and on the sideload side it is the only thing that tells two builds apart.

---

## 4. Digital Asset Links, which is the part that goes wrong

`https://specdrivengames.com/.well-known/assetlinks.json` is what proves the
domain and the app have the same owner. Without a clean answer the app still
runs, **but with a browser address bar pinned across the top** — which on a
phone eats the strip the race HUD puts the running order in, and is the single
most common "why does my app look wrong" outcome here.

It is served by a route rather than a static file because the fingerprints are
not all known at the same time. Set them in the environment:

```
ANDROID_CERT_FINGERPRINTS=<local>,<play>
```

**There are normally two, and forgetting the second is how this fails.** The
APK you signed locally carries your *upload* key. The same app delivered by
Google Play is re-signed by Google with an *app signing* key you never hold, so
a file listing only the local fingerprint verifies for sideloaders and fails
for every Play install. Google's own guidance is that the two keys should
differ, so this is the normal case rather than an edge one.

- Local: `npm run android:fingerprint`
- Play: Play Console → Test and release → Setup → App signing

Three requirements the verifier has, all of which the route and `src/proxy.ts`
already satisfy — check them again after touching either:

1. **HTTPS.** The host's.
2. **HTTP 200 with `Content-Type: application/json`.** Set explicitly.
3. **No redirects.** Android's verifier does not follow a 301 or a 308. This is
   why `next.config.ts` maps `/.well-known/assetlinks.json` with a *rewrite*,
   and why `.well-known` is excluded from the auth middleware matcher.

Check a deploy with:

```bash
curl -s -i https://specdrivengames.com/.well-known/assetlinks.json | head -5
```

A `200` with `content-type: application/json` on the first fetch, and no `3xx`
before it, is the whole test.

---

## 5. Google Play

The sideloaded APK is free, instant and entirely under your control, but it
reaches only people willing to sideload, shows a Play Protect warning, and has
no auto-update and no discovery. Play costs money, time and ongoing policy
compliance, and gives all three back. Do both — the APK now, the listing in
parallel.

### The schedule risks are not the code

Two of these gate everything and neither is a build step. **Start them first.**

- **The $25 account**, one-time, 18+, non-prepaid card. New personal accounts
  go through **identity verification** (government photo ID, proof of address,
  phone). Budget days, not minutes.
- **The 12-tester rule.** A personal account created after 13 November 2023
  must run a closed test with at least **12 testers opted in continuously for
  14 days** before it can apply for production access. That two-week clock is
  the real bottleneck. Organisation accounts are exempt but need a D-U-N-S
  number, which has its own wait.

Budget 2–4 weeks from signup to public launch, almost none of it spent here.

### Technical

- **Target API 36 (Android 16).** From 31 August 2026, new apps and updates
  must target it to be submitted at all. Bubblewrap sets this in the project it
  generates — after `npm run android:update`, check `targetSdkVersion` in
  `android/app/build.gradle` and raise it if the installed Bubblewrap is older
  than the requirement.
- **Upload the AAB**, not the APK. New apps cannot ship a bare APK.
- **Play App Signing** — automatic for new apps. You sign with the upload key,
  Google re-signs with the app signing key. That is the §4 fingerprint problem,
  and it is also the upside: lose the upload key and Google can reset it, which
  is not true of the sideloaded APK.

### Listing

- **Privacy policy URL** — `/privacy`, which exists and is linked from every
  content page. Required, and a prerequisite for the next item.
- **Data safety form** — mandatory, must cover third-party SDKs, and must agree
  with the privacy policy. What is true of this app: Clerk (accounts), Neon
  (worlds, runs, coins), the room server (live session state). **Ads: none in
  the app.** `components/AdSlot.tsx` renders nothing when the page was launched
  from the app — see that file for why — so keep it that way and the
  declaration stays true.
- **Content rating** — the IARC questionnaire. An app without one is not
  allowed on Play.
- **Assets** — icon 512×512 PNG and feature graphic 1024×500, both generated
  by `npm run cap:assets` into `capacitor-android/` (`store_icon.png`,
  `feature_graphic.png`) and held to Play's format by `android-icons.test.ts`;
  **at least two phone screenshots**, which for a game must be actual gameplay. The images in
  `public/covers/` are generated level cards and are *not* screenshots; these
  have to be captured from a real session.

### If it is rejected

The usual reason for a wrapped site is the **minimum-functionality / spam**
policy — "this is a website in an app". What answers it here: it is a game
rather than a brochure; it degrades gracefully offline to the extent anything
server-backed can (`public/sw.js`, `/offline.html`); the back button behaves;
there is a splash screen; and there are launcher shortcuts. Resubmit with an
incremented `versionCode` and a note pointing at those, rather than
re-uploading the same bundle.

---

## 6. Updating

**A TWA bundles no web content, so shipping game changes does not need a new
APK.** Deploy the site and every installed app has the change on next launch.

Rebuild only when the shell itself changes: the package id, the launcher icon,
the app name, the manifest's `display` or `orientation`, or the shortcuts.

---

## 7. The route most people should take

"Install from the browser" on `/download` produces the same fullscreen app,
with the same icon, installed by Chrome — no sideloading prompt, no Play
Protect warning, and it updates itself. `InstallPanel` offers the three routes
in that order (Play, browser, APK) for exactly this reason. The APK exists for
the cases that cannot use it: handing somebody a file, devices where the
install prompt never appears, and having something to upload to Play.
