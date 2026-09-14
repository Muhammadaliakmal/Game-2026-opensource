"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { useLastPlayed } from "@/lib/last-played";
import { sfxUiClose, sfxUiOpen } from "@/lib/audio";

/**
 * "Play in one tap" — the install offer, as a toast.
 *
 * ── When it may appear, and when it must not ─────────────────────────────
 *
 * The install button used to live only on /download, a page nobody visits
 * until they have decided to install — so it converted the people who had
 * already decided. This asks at the moment the decision is actually made:
 * after somebody has PLAYED something and come back to a menu.
 *
 *  - Never on a game screen. A popup over a race is a popup over a race.
 *  - Never before the first game. "Install this" to somebody who has not
 *    pressed Play yet is the banner every site shows and everyone closes.
 *  - Never within fourteen days of "Not now". A dismissal is an answer.
 *  - Never when already installed, and never when there is nothing to offer:
 *    on iOS the browser cannot prompt, so the toast points at the Share-sheet
 *    instructions instead; on a desktop browser with no prompt it stays away
 *    rather than opening a page that says "your browser cannot".
 *
 * ── Form ─────────────────────────────────────────────────────────────────
 *
 * Bottom-right on a wide screen, bottom-centre on a phone, above the safe
 * area. Two buttons, the safe one ("Not now") first in the tab order and the
 * offer as the primary. `open` cue on arrival, `close` on dismiss, and it
 * rises in on the same curve every panel in the app does.
 */
const DISMISS_KEY = "blockworld:install-toast:dismissed-at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;
/** A breath after the menu appears, so it never lands on top of a page load. */
const DELAY_MS = 2500;

/** Game screens: nothing may pop over these. */
const IMMERSIVE = /^\/(play|build|race\/|arena\/)/;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return true;
  }
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

const subscribeNever = () => () => {};

export function InstallToast() {
  const pathname = usePathname();
  const { available, install, installed } = useInstallPrompt();
  const last = useLastPlayed();
  // Read once, outside React, without an effect-set-state: the OS does not
  // change under a running page, and the server answers "no" so the toast
  // never hydrates as a mismatch.
  const ios = useSyncExternalStore(subscribeNever, isIOS, () => false);
  const dismissed = useSyncExternalStore(subscribeNever, dismissedRecently, () => true);

  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);

  const eligible =
    !installed &&
    !dismissed &&
    last !== null &&
    !IMMERSIVE.test(pathname) &&
    (available || ios);

  // The delay is the only thing here that needs an effect: eligibility is a
  // derivation, but "a breath later" is a timer.
  useEffect(() => {
    if (!eligible) return;
    const id = window.setTimeout(() => {
      setShown(true);
      sfxUiOpen();
    }, DELAY_MS);
    return () => window.clearTimeout(id);
  }, [eligible]);

  if (!eligible || !shown) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Then it comes back next visit, which is the worse of two harmless outcomes.
    }
    sfxUiClose();
    setShown(false);
  };

  const onInstall = async () => {
    setBusy(true);
    try {
      const ok = await install();
      if (ok) setShown(false);
      else dismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Install Blockworld"
      className="panel-enter fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[22rem]"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="chamfer chamfer-edge chamfer-edge--accent">
        <div className="chamfer bg-panel flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span
              className="bg-accent mt-1 block h-3.5 w-3.5 shrink-0 rotate-45"
              style={{ boxShadow: "var(--glow-strong)" }}
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-ink text-sm font-semibold">Play in one tap</h2>
              <p className="text-dim text-xs">
                {ios
                  ? "Put Blockworld on your home screen — fullscreen, no address bar, opens straight to the games."
                  : "Install Blockworld: a home-screen icon, fullscreen with no address bar, and it updates itself."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={dismiss} className="hud-chip">
              Not now
            </button>
            {ios ? (
              <Link href="/download" onClick={dismiss} className="hud-chip hud-chip--primary">
                Show me how
              </Link>
            ) : (
              <button
                onClick={onInstall}
                disabled={busy}
                className="hud-chip hud-chip--primary"
                autoFocus
              >
                {busy ? "Installing…" : "Install"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
