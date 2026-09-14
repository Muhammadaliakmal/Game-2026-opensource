/**
 * Whether the WebGL context is currently lost, as one module-level flag.
 *
 * ── What this is for ─────────────────────────────────────────────────────
 *
 * A browser may take the GPU context away at any time and owes the page no
 * explanation: another tab wanted the memory, the driver reset, the phone got
 * hot, the laptop switched GPUs, the tab was backgrounded too long. three
 * handles its own side correctly — it calls `preventDefault` on the loss
 * (which is what makes a restore possible at all) and rebuilds its state on
 * `webglcontextrestored`.
 *
 * What it does NOT do is tell anybody. `renderer.render()` returns early while
 * the context is gone, so the canvas holds whatever was last drawn into it —
 * on a fresh mount, nothing, which is a black rectangle. No error is thrown,
 * no promise rejects, nothing appears in the console except one info line. The
 * race is the heaviest scene in the app and therefore the likeliest place to
 * be on the wrong end of it.
 *
 * So the flag lives outside React — the event arrives from the DOM, not from a
 * render — and the UI reads it with `useSyncExternalStore`, per CLAUDE.md.
 * Deliberately global rather than per-canvas: there is one GPU context per
 * page in practice, and a second canvas is not a second answer.
 */

let lost = false;
const listeners = new Set<() => void>();

/** Subscribe, `useSyncExternalStore` style. */
export function subscribeGlContext(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isGlContextLost(): boolean {
  return lost;
}

/** The server has no GPU to lose. */
export function glContextServerSnapshot(): boolean {
  return false;
}

/**
 * Record a change. Notifies only on a real transition, so a driver that fires
 * the same event twice does not re-render every subscriber twice.
 */
export function setGlContextLost(next: boolean): void {
  if (lost === next) return;
  lost = next;
  for (const fn of listeners) fn();
}
