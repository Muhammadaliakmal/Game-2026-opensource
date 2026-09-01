"use client";

import { useEffect, useState } from "react";

/** Vendor-prefixed shims — Safari still needs webkit* for the Fullscreen API. */
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/**
 * Toggles fullscreen on the whole document. Must be triggered by a user
 * gesture, so it lives behind a button. Tracks `fullscreenchange` so the label
 * stays correct when the user leaves fullscreen with Esc.
 */
export function FullscreenButton({ className }: { className?: string }) {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const doc = document as FsDocument;
    const sync = () =>
      setIsFs(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggle = () => {
    const doc = document as FsDocument;
    const el = document.documentElement as FsElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
      } else {
        (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
      }
    } catch {
      /* fullscreen can be blocked by browser policy — nothing to recover */
    }
  };

  return (
    <button
      onClick={toggle}
      className={className}
      title={isFs ? "Leave fullscreen" : "Enter fullscreen"}
      aria-label="Toggle fullscreen"
      aria-pressed={isFs}
    >
      {/* Icon-only under sm so the HUD stays compact on phones. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        {isFs ? (
          <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
        ) : (
          <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
        )}
      </svg>
      <span className="hidden sm:inline">
        {isFs ? "Windowed" : "Full screen"}
      </span>
    </button>
  );
}
