"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { capacitorBuild } from "@/lib/app-mode";
import { LATEST_APP_BUILD } from "@/lib/capacitor-identity";

/**
 * "A newer version of the app is out", shown only inside an out-of-date
 * Capacitor install.
 *
 * A sideloaded APK has no store behind it, so nothing else will ever tell its
 * player a new build exists. The game itself is always current — it is the
 * live site — so this is about the shell: the back button, the no-ads block,
 * the download handler. Worth updating, never worth interrupting a run for,
 * which is why it is a dismissible line under the header (hidden on game
 * screens with the header) rather than a dialog.
 */

const subscribeNever = () => () => {};
const buildSnapshot = () => capacitorBuild(navigator.userAgent);
const noBuildOnServer = () => null;

export function AppUpdateNotice() {
  const build = useSyncExternalStore(subscribeNever, buildSnapshot, noBuildOnServer);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || build === null || build >= LATEST_APP_BUILD) return null;

  return (
    <div
      role="status"
      className="app-update border-[var(--border-color)] bg-surface flex shrink-0 items-center justify-between gap-3 border-b px-4 py-2 text-xs sm:px-6"
    >
      <span className="text-dim">A newer version of the app is available.</span>
      <span className="flex items-center gap-2">
        <Link href="/download" className="hud-chip hud-chip--primary">
          Update
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="hud-chip"
        >
          ✕
        </button>
      </span>
    </div>
  );
}
