/**
 * Landscape for a letterboxed cabinet, asked for on the press that opens it.
 *
 * Every action cabinet plays in a fixed 960×540 view (see `view.ts`), and on
 * a phone held upright that fits to the screen's width: a room about 220px
 * tall with a lot of black above and below it. The view is fixed for fairness
 * and must stay fixed, so the only way to make the room bigger is to turn the
 * phone — and on Android Chrome the page can do that itself.
 *
 * ── Why here, and why synchronously ──────────────────────────────────────
 *
 * `requestFullscreen` needs a user gesture, and `screen.orientation.lock`
 * needs fullscreen first (the spec makes fullscreen a pre-lock condition).
 * `useArcade.open` is called straight from the click or the `E` keydown, so
 * this runs inside that gesture. An effect in the overlay would run a render
 * later, which Chrome usually still allows and Safari does not — close enough
 * to working to be the worse choice.
 *
 * ── Best effort, and nothing else depends on it ──────────────────────────
 *
 * iPhone Safari has no element fullscreen and no orientation lock, desktop
 * rejects the lock, and `/arcade?play=` opens with no gesture at all. Every
 * one of those falls through to `RotateHint`, which offers the same thing as
 * a sentence. The installed Android app is already landscape and fullscreen,
 * so the portrait test below is false there and this does nothing.
 */

type Lockable = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

/** True only while this module is the reason the page is fullscreen. */
let ours = false;

function releasedElsewhere() {
  // A back gesture or Esc leaves fullscreen without us, and the browser drops
  // the lock with it. Forget the claim, so `leaveLandscape` does not exit a
  // fullscreen somebody else asked for later.
  if (!document.fullscreenElement) {
    ours = false;
    document.removeEventListener("fullscreenchange", releasedElsewhere);
  }
}

export function enterLandscape(): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(pointer: coarse) and (orientation: portrait)").matches) return;
  const el = document.documentElement;
  if (document.fullscreenElement || typeof el.requestFullscreen !== "function") return;

  el.requestFullscreen({ navigationUI: "hide" })
    .then(() => {
      ours = true;
      document.addEventListener("fullscreenchange", releasedElsewhere);
      // Fullscreen without the turn is still worth keeping: it gives the room
      // the height the address bar was taking.
      return (screen.orientation as Lockable | undefined)?.lock?.("landscape");
    })
    .catch(() => {
      /* Refused or unsupported. RotateHint says it instead. */
    });
}

export function leaveLandscape(): void {
  if (typeof window === "undefined" || !ours) return;
  ours = false;
  document.removeEventListener("fullscreenchange", releasedElsewhere);
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* unlock throws where lock was never supported */
  }
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}
