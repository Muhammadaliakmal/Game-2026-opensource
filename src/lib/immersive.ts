import type { Viewport } from "next";

/**
 * The viewport every screen that owns the whole display shares.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────
 *
 * A double-tap or a two-finger pinch anywhere on a game screen zoomed the
 * *page*, not the camera — the browser's own visual viewport scaled up, the
 * HUD went with it, and the fixed-position thumb clusters ended up somewhere
 * off the edge of the screen with no way back except reloading. Panning did
 * the same thing: once zoomed, a drag that started on a gap between panels
 * scrolled the document instead of turning the camera.
 *
 * It is entirely a viewport-meta problem. `touch-action: none` on the canvas
 * stops the canvas from being panned, and does nothing about a pinch that
 * begins on the HUD, because browser zoom is not a touch-action gesture. The
 * only thing that turns it off is `maximum-scale=1, user-scalable=no`, which
 * is what these two fields compile to.
 *
 * ── Why this is not in the root layout ───────────────────────────────────
 *
 * Because it would then apply to the home page, the gallery and the download
 * page, and WCAG 1.4.4 asks that text can be resized to 200%. Disabling zoom
 * on a page of prose is an accessibility failure with nothing to trade for it.
 * On a game screen the trade is real — a zoomed-in HUD is an unplayable game,
 * and there is no text to reflow — so the lock is scoped to exactly the routes
 * that are a game and not a document.
 *
 * `viewportFit: "cover"` is restated rather than inherited. Next merges
 * viewport exports field by field, so omitting it would in fact keep the root
 * layout's value — but the whole point of this object is to be the complete
 * description of an immersive screen, and a reader should not have to hold two
 * files in their head to know what one is.
 */
export const IMMERSIVE_VIEWPORT: Viewport = {
  themeColor: "#0a0a0f",
  viewportFit: "cover",
  maximumScale: 1,
  userScalable: false,
};
