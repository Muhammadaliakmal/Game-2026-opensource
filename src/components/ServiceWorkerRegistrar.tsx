"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js. Renders nothing.
 *
 * Production only, and that is not caution for its own sake: in `next dev` the
 * worker would sit in front of a dev server that is already serving from memory
 * and rebuilding on save, and the first confusing symptom is an edit that does
 * not appear because a previous build's chunk is being served from a cache. The
 * worker earns nothing in dev and costs exactly that.
 *
 * Registered after `load` so it never competes with the first paint for
 * bandwidth — a canvas app's first screen is the expensive one, and the worker
 * has no work to do until the visit after this one.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => {
        // Not fatal — the app works without it, and it is unavailable in a
        // private window on some browsers by design.
        console.warn("[sw] registration failed", e);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
