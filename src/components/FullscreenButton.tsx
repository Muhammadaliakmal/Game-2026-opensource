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
      title="Toggle fullscreen"
      aria-label="Toggle fullscreen"
      aria-pressed={isFs}
    >
      {isFs ? "Exit full screen" : "Full screen"}
    </button>
  );
}
