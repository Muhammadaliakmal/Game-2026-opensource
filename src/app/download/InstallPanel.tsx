"use client";

import { useState, useSyncExternalStore } from "react";
import { useInstallPrompt } from "@/lib/use-install-prompt";

/**
 * The part of /download that depends on which device is asking.
 *
 * Split out as a client island so the page around it stays a Server Component
 * and the APK's size and date are still rendered on the server. Platform is the
 * only thing here that needs the browser.
 *
 * There are three genuinely different answers and no way to give one that
 * covers all of them:
 *
 * - **Android** can have the APK, and can usually also install straight from
 *   the browser, which is the better route — no sideloading, and it updates
 *   itself with the site.
 * - **iOS** has neither. Safari does not fire `beforeinstallprompt` and there
 *   is no APK to give it, so the honest answer is the Share-sheet instructions.
 * - **Desktop** can install too, and saying nothing there would read as the
 *   page being broken.
 */

type Platform = "android" | "ios" | "desktop" | "unknown";

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ reports a Mac UA, so the touch-point count is what separates an
  // iPad from an actual Mac.
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "ios";
  return "desktop";
}

/**
 * The platform never changes under a running page, so there is nothing to
 * subscribe to — but it is still a value read from outside React, and reading
 * it through `useSyncExternalStore` is what lets the server render "unknown"
 * and the client correct it without a second render or a hydration mismatch.
 * The same thing done with an effect is what React's `set-state-in-effect` rule
 * exists to flag.
 */
const subscribePlatform = () => () => {};
const platformServerSnapshot = (): Platform => "unknown";

export function InstallPanel({
  apkAvailable,
  apkPath,
}: {
  apkAvailable: boolean;
  apkPath: string;
}) {
  const platform = useSyncExternalStore(
    subscribePlatform,
    detect,
    platformServerSnapshot
  );

  const { available, install, installed } = useInstallPrompt();
  const [busy, setBusy] = useState(false);

  const onInstall = async () => {
    setBusy(true);
    try {
      await install();
    } finally {
      setBusy(false);
    }
  };

  if (installed) {
    return (
      <section className="card border-accent/40 flex flex-col gap-3 p-5">
        <h2 className="text-ink text-sm font-semibold">Already installed</h2>
        <p className="text-dim text-xs">
          You are running Spec Driven Games as an app, so it is already on your home
          screen and it updates itself with the site.
        </p>
        {/* A route out, rather than a full stop.

            This page said "Nothing to do here" and meant it — a screen a
            player navigated to deliberately, which then offered them nothing
            and no way onward except Back. The nav slot that leads here is now
            hidden once installed (see components/SiteNav), so the only people
            who reach this are following an old link or a shared URL; they
            should still land somewhere they can play from. */}
        <div className="flex flex-wrap gap-2">
          <a href="/parkour" className="hud-chip hud-chip--primary">
            Play parkour
          </a>
          <a href="/arcade" className="hud-chip">
            Arcade
          </a>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ── Install from the browser ── */}
      <section className="card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-ink text-sm font-semibold">
            Install from the browser
          </h2>
          <p className="text-dim text-xs">
            Adds Spec Driven Games to your home screen and runs it fullscreen, without
            the address bar. It updates itself with the site, so there is
            nothing to reinstall later — this is the route to prefer if your
            browser offers it.
          </p>
        </div>

        {available && (
          <button
            onClick={onInstall}
            disabled={busy}
            className="hud-chip hud-chip--primary w-fit"
          >
            {busy ? "Installing…" : "Install Spec Driven Games"}
          </button>
        )}

        {!available && platform === "ios" && (
          <ol className="text-dim flex list-decimal flex-col gap-1.5 pl-4 text-xs">
            <li>
              Open this page in <span className="num">Safari</span> — other iOS
              browsers cannot install it.
            </li>
            <li>
              Tap the Share button, then{" "}
              <span className="num">Add to Home Screen</span>.
            </li>
          </ol>
        )}

        {!available && platform !== "ios" && (
          <p className="text-dim text-xs">
            Your browser has not offered an install prompt. Chrome and Edge show
            one from an install icon in the address bar; Firefox does not
            support installing web apps on desktop at all.
          </p>
        )}
      </section>

      {/* ── The APK ── */}
      {platform !== "ios" && (
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-ink text-sm font-semibold">
              Android APK
            </h2>
            <p className="text-dim text-xs">
              A signed Android package, for installing without a store. Same
              game — it opens the live site in a fullscreen app window, so a
              network connection is still needed to build or race.
            </p>
          </div>

          {apkAvailable ? (
            <>
              <a
                href={apkPath}
                download
                className="hud-chip hud-chip--primary w-fit"
              >
                Download the APK
              </a>
              <details className="text-dim text-xs">
                <summary className="cursor-pointer select-none">
                  Installing an APK
                </summary>
                <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4">
                  <li>Download the file on the phone itself.</li>
                  <li>
                    Open it. Android will ask to allow installs from your
                    browser — this is expected for anything outside the Play
                    Store, and the permission is per-app.
                  </li>
                  <li>
                    Play Protect may warn that the app is unrecognised. It is,
                    in the sense that it has never been submitted to Google;
                    choose <span className="num">Install anyway</span> if you
                    trust where you got the file.
                  </li>
                </ol>
              </details>
            </>
          ) : (
            <p className="text-dim text-xs">
              Not published yet. Install from the browser above — on Android
              that produces the same fullscreen app, with the same icon, and it
              stays up to date on its own.
            </p>
          )}
        </section>
      )}
    </>
  );
}
