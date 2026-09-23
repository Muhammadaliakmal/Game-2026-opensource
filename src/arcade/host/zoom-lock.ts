/**
 * No page zoom while a cabinet is open.
 *
 * The game routes lock zoom through their viewport export
 * (`lib/immersive.ts`), but a cabinet is an overlay on `/arcade`, which is a
 * page of prose and must stay zoomable (WCAG 1.4.4). So the overlay did not
 * have the lock — and Ragdoll Rumble is played with two thumbs, which the
 * browser reads as a pinch: the page scaled and slid under the fight, the
 * "wiggle", and the thumb pads drifted off the controls they were drawn on.
 *
 * So the lock is taken for as long as the overlay is up and handed back on
 * close, by rewriting the viewport meta — the same two fields
 * `IMMERSIVE_VIEWPORT` compiles to. iOS Safari ignores `user-scalable=no`
 * on purpose, so its own pinch events (`gesturestart`/`gesturechange`) are
 * cancelled as well, and a multi-touch move is refused at the document.
 */
export function lockZoom(): () => void {
  if (typeof document === "undefined") return () => {};
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const before = meta?.getAttribute("content") ?? null;
  if (meta && before !== null && !/user-scalable\s*=\s*no/.test(before)) {
    meta.setAttribute("content", `${before}, maximum-scale=1, user-scalable=no`);
  }

  const cancel = (e: Event) => e.preventDefault();
  const pinch = (e: TouchEvent) => {
    if (e.touches.length > 1) e.preventDefault();
  };
  document.addEventListener("gesturestart", cancel, { passive: false });
  document.addEventListener("gesturechange", cancel, { passive: false });
  document.addEventListener("touchmove", pinch, { passive: false });

  return () => {
    if (meta && before !== null) meta.setAttribute("content", before);
    document.removeEventListener("gesturestart", cancel);
    document.removeEventListener("gesturechange", cancel);
    document.removeEventListener("touchmove", pinch);
  };
}
