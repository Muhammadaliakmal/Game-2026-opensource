/**
 * The Android app's identity, in one place.
 *
 * The app is a Trusted Web Activity: an Android shell whose entire UI is the
 * user's own Chrome rendering this site fullscreen. See docs/ANDROID.md for
 * why that, and not a WebView wrapper like Capacitor.
 *
 * Three separate things need to agree on the values below, and they are built
 * at three different times by three different tools:
 *
 * - `twa/twa-manifest.json`, read by Bubblewrap when it generates the project.
 * - `/.well-known/assetlinks.json`, served by this app, read by Android's
 *   verifier on install.
 * - The Play Console listing, typed in by hand.
 *
 * A mismatch between any two of them fails silently rather than loudly, which
 * is the whole reason they are sourced from one module.
 */

/**
 * The app's permanent identity on a device, reverse-DNS.
 *
 * Changing this after anything has shipped installs a *second* app beside the
 * first rather than updating it, and on the Play Store the id cannot be
 * reused or renamed at all — a package id is spent the moment it is published.
 *
 * `com.specdrivengames.app`, because that is the id the TWA was actually
 * published to Play under (`applicationId` in `android/app/build.gradle`).
 * It was planned as `com.specdrivengames.twa`, and the site kept serving that
 * after the build moved: the asset-link vouched for a package nobody had
 * installed, so every Play install opened with an address bar, and the
 * `android-app://` referrer check in `app-mode.ts` never matched, so the app
 * showed web ads. The Java namespace is still `com.specdrivengames.twa`;
 * only the application id matters to either check.
 */
export const ANDROID_PACKAGE_ID = "com.specdrivengames.app";

/**
 * SHA-256 fingerprints of every certificate allowed to claim this domain.
 *
 * ── Why a list, and why from the environment ─────────────────────────────
 *
 * There is never only one signing key. A build signed locally for sideloading
 * carries the *upload* key; the same build delivered by Google Play is
 * re-signed by Google with an *app signing* key you never hold. Both must be
 * listed or one of the two distributions opens with a browser address bar
 * pinned over the HUD — and the Play one is the half that fails, because the
 * fingerprint people paste is almost always the local one they just generated.
 * Google's own guidance is that the two keys should differ, so this is the
 * normal case rather than an edge one.
 *
 * From the environment rather than a constant because the Play app signing
 * fingerprint does not exist until the first bundle has been uploaded, which
 * is after this code has shipped. A redeploy with a new env var beats a code
 * change on the day the Play Console finally shows you the value.
 *
 * Format: comma- or whitespace-separated, colons optional, case-insensitive.
 * Anything that is not 32 hex bytes is dropped rather than served, because a
 * malformed entry invalidates the whole file for the verifier and takes the
 * valid fingerprint next to it down with it.
 */
export function androidFingerprints(): string[] {
  const raw = process.env.ANDROID_CERT_FINGERPRINTS ?? "";
  const seen = new Set<string>();

  for (const part of raw.split(/[,\s]+/)) {
    const hex = part.replace(/:/g, "").trim().toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hex)) continue;
    // Re-insert the colons. The verifier accepts the colon-separated form and
    // that is the form every tool prints, so normalising to it keeps the
    // served file diffable against what `keytool` and the Play Console show.
    seen.add(hex.match(/../g)!.join(":"));
  }

  return [...seen];
}

/**
 * The Play Store listing, once there is one.
 *
 * Null until the app clears production review — and a link to a store page
 * that 404s is worse than no link, because it reads as the app having been
 * pulled. `/download` branches on this rather than on a hardcoded date.
 */
export const PLAY_STORE_URL: string | null = process.env.NEXT_PUBLIC_PLAY_STORE_URL || null;
