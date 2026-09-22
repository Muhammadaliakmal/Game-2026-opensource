import { CABINETS } from "../registry";
import { connectionHint, shouldPrefetch } from "@/lib/prefetch";

/**
 * Download every cabinet's code while there is a connection to do it with.
 *
 * A cabinet is its own chunk, fetched the first time it is opened, and the
 * service worker keeps `/_next/static/` once it has been fetched. So a cabinet
 * nobody had opened yet could not start offline — "That cabinet would not
 * start" on a phone that had the arcade on screen. Importing them all once,
 * on idle, puts every one in that cache. They are small 2D games with no
 * assets beyond their own code, so this is the whole of what they need.
 *
 * Same guard as `<PrefetchCanvas>`: not on Data Saver, not below 4g.
 */
let warmed = false;

export function warmCabinets(): void {
  if (warmed || typeof window === "undefined") return;
  if (navigator.onLine === false || !shouldPrefetch(connectionHint())) return;
  warmed = true;

  const run = () => {
    for (const cabinet of CABINETS) {
      // A failure only means this one is fetched on open instead; try the
      // whole set again next time the arcade mounts.
      void cabinet.load().catch(() => {
        warmed = false;
      });
    }
  };

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (idle) idle(run);
  else setTimeout(run, 1500);
}
