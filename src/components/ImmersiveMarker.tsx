/**
 * Says "a game is on this page", so the site header can get out of the way.
 *
 * ── Why a marker element and not a prop, a context or a store ────────────
 *
 * The header lives in the root layout, which is a Server Component and an
 * ancestor of every route. There is no prop that runs upward, and putting the
 * flag in a client store would mean making the header a Client Component and
 * accepting a frame of the wrong thing on every navigation — the header would
 * render, then an effect would fire, then it would vanish. On the installed
 * app that is a visible jump on the way into every world.
 *
 * A marker in the DOM lets CSS answer the question with no JavaScript at all:
 * `body:has([data-immersive])` is true on the server-rendered HTML, so the
 * header is never painted in the first place. `:has()` has been baseline in
 * every browser this app targets since 2023.
 *
 * ── Why it is `hidden` rather than zero-sized ────────────────────────────
 *
 * `hidden` gives it `display: none`, so it takes no space and cannot disturb
 * the definite-height chain the R3F canvas depends on (see the root layout's
 * note on `h-dvh`). A `display: none` element is still in the document, and
 * `:has()` still matches it — visibility and presence are different questions.
 */
export function ImmersiveMarker() {
  return <div data-immersive hidden aria-hidden />;
}
