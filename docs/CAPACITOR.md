# The Capacitor app

A second Android distribution, beside the Bubblewrap TWA in `docs/ANDROID.md`.
Same site, different renderer, different package id, and it can sit on a device
next to the TWA rather than replacing it.

Status as of **22 September 2026**: the project is generated, signed and
building. Nothing has been uploaded anywhere.

---

## 0. Read this before choosing it

`docs/ANDROID.md` §0 argues against a WebView wrapper and that argument has not
changed. It is restated here rather than hidden, because the wrapper now exists
and the existence of a thing is not an argument for shipping it.

**A TWA renders in Chrome. This renders in Android System WebView.** Those are
different engines on different update cadences, and on a fragment-bound 3D
canvas that is a real frame-rate difference. The TWA gets the same WebGL, the
same JIT and the same GPU path as a browser tab, because it is one.

So why does this exist at all:

| It gives you | Which matters when |
|---|---|
| A native project you own | You need to add something Chrome will not do — a native SDK, a custom back stack, an in-app purchase |
| The Google Mobile Ads SDK hook | AdSense inside the app ever becomes a requirement rather than something switched off |
| Independence from Chrome | A device has no Chrome, or a Chrome too old for a TWA |
| Push notifications | Not implemented here. See §7 |

**If none of those is the reason, ship the TWA.** It is smaller, faster on this
workload, and needs no binary rebuild to ship a game change.

---

## 1. What it is made of

| Thing | Where | Note |
|---|---|---|
| Config | `capacitor.config.ts` | The only file that decides behaviour. Heavily commented; read it before changing any of it |
| Shared identity | `src/lib/capacitor-identity.ts` | Package id and the user-agent token. Imported by *both* the config and the browser |
| Launch shell | `capacitor/www/index.html` | The bundled origin the app boots from |
| Offline page | `capacitor/www/offline.html` | `server.errorPath`. Near-twin of `public/offline.html` |
| Native project | `capacitor-android/` | **Committed.** See §4 |
| Back button | `capacitor-android/.../MainActivity.java` | Native, and it has to be. See §3 |

---

## 2. The loading strategy, and why there is no `server.url`

Capacitor can point the WebView straight at `https://specdrivengames.com` with
one config line. Its own documentation says that option is "intended for use
with live-reload servers" and "**not intended for use in production**", and a
binary that ships one is the textbook thin wrapper a store reviewer rejects.

The supported alternative is to bundle a static build into `webDir`, and **this
app has no static build to bundle** — Clerk renders session state into the
document, worlds come from Neon through `/api/`, `/download` is
`force-dynamic`, and races run through a Colyseus room. That is the same fact
that ruled Capacitor out as the primary distribution.

So the app does the third thing:

1. It boots on its own bundled origin — `capacitor/www/index.html`.
2. That shell hides the splash, checks connectivity, and `location.replace`s to
   the live site.
3. `server.allowNavigation` keeps our own hosts inside the WebView. Everything
   else — Discord, an ad click-through — leaves for the system browser, which
   is correct for a link that is not ours.
4. A failed navigation lands on the bundled `offline.html` via
   `server.errorPath`, so a dead connection is an explained page rather than
   the white screen that gets wrappers rejected.

**The consequence to remember: past step 2 there is no Capacitor bridge.** The
live site is an ordinary remote origin. `window.Capacitor` is undefined there,
no plugin is callable, and anything the app needs to do on those pages has to
be native or has to be a signal that survives navigation. Exactly two things
currently do — the back button (§3) and the user-agent token (§5).

---

## 3. The back button is native, and that is not a preference

Capacitor's documented back-button handling is a JavaScript listener from
`@capacitor/app`. It would work on precisely one screen here — the shell,
which nobody sees for longer than a frame — because of the consequence above.

`MainActivity.java` registers an `OnBackPressedCallback` that asks the WebView
whether it `canGoBack()`. Two details in there are load-bearing and the file
says so at more length:

- **It is registered after `super.onCreate()`.** `OnBackPressedDispatcher` runs
  callbacks in reverse registration order, and `BridgeActivity` registers its
  own — the one that routes to the absent JS listener — inside `super`.
- **Exhausted history disables the callback and re-dispatches** rather than
  calling `finish()`, so Android 13+'s predictive back gesture animates the app
  away instead of blinking it off screen.

Leaving this unhandled means back closes the app from any screen, which is
both bad and a documented Play rejection under minimum-functionality.

---

## 4. The native project is committed, unlike the TWA's

`.gitignore` takes the opposite rule for `capacitor-android/` that it takes for
`android/`, on purpose.

Bubblewrap regenerates its entire project from `twa-manifest.json`, so that
project is an *output* and ignoring it loses nothing. A Capacitor native
project is not an output. `MainActivity.java` carries the back-button handler,
`app/build.gradle` carries the signing config and R8, `proguard-rules.pro`
carries the keep rules — all hand-written, none of them reproducible by
`npx cap add android`, which would overwrite them. Capacitor documents the
native project as source for exactly this reason.

Committed: everything except the secrets and the build outputs.
**Never committed: `release.keystore` and `keystore.properties`.**

---

## 5. AdSense, which is a launch blocker rather than a detail

Google's AdSense program policies require that ads shown through a web content
viewing frame register the WebView with the Google Mobile Ads SDK
("WebView API for Ads"). Serving ordinary AdSense inside a bare WebView is what
gets accounts terminated under "Valuable Inventory: Framed Sites". This is not
a Play rule that a reviewer might miss; it is an AdSense rule with an account
attached.

**How it is answered here: there are no ads in the app.** `AdSlot` already
renders nothing when `isAndroidApp()` is true, and the Play Data safety
declaration for the TWA says no ads in the app. The work was making that check
answer correctly inside a WebView, because it could not:

- The TWA is detected by its `android-app://<package id>` launch referrer,
  which Chrome sets and a WebView does not. Inside Capacitor that check
  answers "no", and `AdSlot` would have rendered live AdSense in a WebView.
- So the config appends `SpecDrivenGamesApp/1` to the user agent, and
  `app-mode.ts` checks for it. The user agent belongs to the WebView rather
  than to a document, which is what lets it survive the navigation to the
  remote origin where the bridge does not exist.

**If ads in this app are ever wanted**, the answer is not to remove that check.
It is `MobileAds.registerWebView()` on the main thread in
`MainActivity.onCreate()`, plus the Mobile Ads SDK dependency — and the Data
safety declaration has to change with it.

---

## 6. The icon and the splash

Generated from `assets/icon-master.png` by `npm run cap:assets`
(`scripts/generate-android-assets.ts`), never hand-edited — the same rule
`npm run icons:generate` follows for the web, and for the same reason: a set
edited by hand is a set where two sizes drift apart and nobody finds out
until an install looks wrong on somebody else's phone.

The TWA needs no equivalent. Bubblewrap reads the web manifest and derives
its own buckets from the icons the web script already wrote. Capacitor does
not: `npx cap add android` writes the Android Studio template's icon and
leaves it, which is how this app spent its first commit building with a teal
square and the Android robot on the launcher.

**The Android safe zone is not the web's.** A maskable web icon guarantees
the centre 80%, a circle of radius 40% of the edge. An adaptive Android icon
is a 108dp layer of which only the centre **72dp** is ever displayed, so the
guaranteed circle has radius 36dp — a third of the layer. Three consequences,
all of them measured rather than assumed:

- **The artwork is mapped onto the visible 72dp, not shipped full-bleed.**
  Both fit: the cube lands at 60% of the safe radius mapped and 89%
  full-bleed. The choice is not about safety, it is that 60% is exactly where
  the PWA icon puts it, and §0 says this app and the TWA can be installed at
  once. Two icons drawn from one piece of artwork must not disagree about how
  big the cube is on the one home screen that has both.
- **The 18dp bleed is a copy of the edge pixels**, not a fill. The artwork is
  a vertical gradient, so a flat fill would meet it at a hard seam lying
  exactly on the mask boundary — the one place the mask has stopped hiding
  things, and parallax is the one time it moves into view.
- **The artwork is the foreground layer**, and `@color/ic_launcher_background`
  is the launch colour behind it. Android 12+ draws its system splash icon
  from the foreground, so a transparent one is a blank circle there; and an
  opaque layer spanning all 108dp still covers the mask wherever parallax
  shifts it.

**The splash is a field of `#1a1d21` with the mark centred on it** — not the
artwork full-bleed, because the background during launch has to be the colour
everything else during launch already is. That invariant is
`capacitor/www/index.html`'s, and it now reaches the one surface it did not
cover: the launch theme sets `windowSplashScreenBackground`, because on API
31+ the platform draws its own splash *before* the activity and ignores the
`android:background` the drawable hangs off. The icon there is left unset on
purpose — unset means the app icon, which is now the artwork.

The same script writes the two Play listing images beside the project:
`store_icon.png` (512², opaque 32-bit) and `feature_graphic.png` (1024×500,
no alpha) — the night sky, the island cover at its native size, and the mark
and name on the left. Screenshots are not generated and cannot be: Play
requires real gameplay there.

`src/lib/android-icons.test.ts` measures all of it, including the one that
only breaks later: artwork replaced with a mark reaching further out than the
cube, which is invisible until a round launcher crops it.

---

## 7. What is NOT done

Listed because a wrapper's value is the native things it can do, and these are
the ones the guide this was built from recommends:

- **Push notifications.** `@capacitor/push-notifications` plus Firebase. Not
  installed. It is the single strongest answer to a minimum-functionality
  rejection, and it needs a Firebase project and a `google-services.json`.
- **`@capacitor/browser`** for opening external links in a custom tab rather
  than kicking out to the browser app.
- **`@capacitor/preferences`** for native key/value storage. Worth little
  here for the reason in §2: the bridge does not exist on the live origin, so
  only the shell could call it, and the shell stores nothing.
- **Anything on Play.** No listing, no account. That whole schedule is
  `docs/ANDROID.md` §5 and it is identical for this app, with one addition: a
  second package id means a second listing, a second Data safety form and a
  second content rating.

---

## 8. Building

Prerequisites are the same as the TWA's (`docs/ANDROID.md` §2) plus the ones
Capacitor 8 adds: **Node 22+**, and a **JDK 17** for Gradle.

```bash
npm run cap:sync      # copy capacitor/www + plugins into the native project
npm run cap:assets    # icons + splash from assets/icon-master.png. See §6
npm run cap:debug     # debug APK  -> capacitor-android/app/build/outputs/apk/debug/
npm run cap:build     # signed release APK + AAB
npm run cap:open      # open in Android Studio
npm run cap:fingerprint
```

`cap:sync` runs before both build scripts, so a change to the shell or the
config reaches the APK without a separate step. A change to
`MainActivity.java`, `build.gradle` or the ProGuard rules is already in the
native project and needs nothing.

`cap:assets` is **not** wired into either build, deliberately. Its output is
committed, like `public/icons`, so the build has nothing to do; what catches a
stale set is `android-icons.test.ts` failing, not a slower build. Run it when
the artwork changes.

**The version numbers are in `capacitor-android/app/build.gradle`**
(`versionCode`, `versionName`), not in `capacitor.config.ts`. Bump
`versionCode` by one for every build that goes anywhere: Play refuses a bundle
whose code it has seen, and on the sideload side it is the only thing that
tells two builds apart.

### The keystore

`capacitor-android/release.keystore`, alias `specdrivengames`, with its
password in `capacitor-android/keystore.properties`. Both are gitignored.

It is a **different key from the TWA's** because it signs a different app. The
same warning applies to both: an APK signed with a different key cannot upgrade
one signed with this one — Android refuses the install, and the only way out is
uninstalling, which takes the player's local data with it. **Back it up
somewhere that is not this machine and not this repo.**

---

### Shipping a new APK to /download

Gradle must run on **JDK 21**: Capacitor 8 compiles with Java 21 source, so
JDK 17 cannot build it, and Gradle 8.14 cannot run on JDK 25. On this machine:
`JAVA_HOME="C:\Program Files\Zulu\zulu-21"`.

1. Bump `versionCode` and `versionName` in `capacitor-android/app/build.gradle`.
2. Set `APK_VERSION` in `src/lib/apk.ts` to the new versionName, and
   `LATEST_APP_BUILD` in `src/lib/capacitor-identity.ts` to the new versionCode.
3. `npm run cap:build`, then `npm run cap:release` — it refuses to publish if
   any of the three disagree.
4. Commit `public/blockworld.apk` and its `.sha256`, and deploy.

A sideloaded app never updates itself. `MainActivity` puts
`SDGAppBuild/<versionCode>` on the user agent, and `AppUpdateNotice` shows a
dismissible "update available" line under the header of any install older
than `LATEST_APP_BUILD`. Its link works because `MainActivity` also hands
downloads to the system browser — a WebView with no `DownloadListener`
silently drops them, which is what Capacitor ships with.

## 9. Updating

Unlike the TWA, **this app has no automatic relationship with a site deploy for
its shell**, but it has one for everything else: the shell and the offline page
are baked into the APK, and every page past them is fetched live. So:

- A game change, a new course, a new cabinet — deploy the site. Done. No
  rebuild.
- A change to `capacitor/www/*`, `capacitor.config.ts`, the native project, the
  icon or the package id — rebuild and redistribute.
