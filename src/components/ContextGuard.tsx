"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useSyncExternalStore } from "react";
import {
  glContextServerSnapshot,
  isGlContextLost,
  setGlContextLost,
  subscribeGlContext,
} from "@/lib/gl-context";

/**
 * Notices when the GPU takes the context away, and says so.
 *
 * Goes INSIDE a `<Canvas>` — it needs `gl.domElement`, which is where the two
 * events are dispatched. Renders nothing; the message is
 * `<ContextLostNotice />`, which goes outside the canvas, because a DOM
 * overlay is the one thing still drawable when there is no GPU context to
 * draw with.
 *
 * `preventDefault` on the loss is what permits a restore, and three already
 * calls it. It is called again here rather than relied upon: this component's
 * whole reason to exist is that the context can come back, and a requirement
 * that lives in another library's source is one refactor from being gone
 * without a test failing.
 *
 * Nothing needs to be rebuilt by hand on restore. three re-initialises its
 * own GL state and re-uploads what it needs on the next draw, `FrameLimiter`
 * never stopped calling `advance()`, and the block surface arrays and palette
 * materials are ordinary three objects that come back with everything else.
 */
export function ContextGuard() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;

    const onLost = (e: Event) => {
      e.preventDefault();
      setGlContextLost(true);
    };
    const onRestored = () => {
      setGlContextLost(false);
      // A no-op under `frameloop="never"` — FrameLimiter's own loop is what
      // brings the picture back — and the right call under "demand", which is
      // what the editor uses and which really would sit on a blank frame.
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Unmounting a canvas is not the GPU failing. Leaving the flag set
      // would put the notice over the next screen the player opens.
      setGlContextLost(false);
    };
  }, [gl, invalidate]);

  return null;
}

/**
 * What the player sees instead of a black rectangle.
 *
 * Outside the `<Canvas>`, deliberately: everything inside it is unrenderable
 * by definition at the moment this is wanted.
 *
 * Reload rather than a "retry" button. There is nothing this page can do to
 * make a browser hand the context back — `restoreContext()` exists only on
 * the debug extension that took it away — so a retry that cannot retry is a
 * button that lies. If the browser restores it on its own, the notice goes
 * away by itself and the button is never pressed.
 */
export function ContextLostNotice() {
  const lost = useSyncExternalStore(
    subscribeGlContext,
    isGlContextLost,
    glContextServerSnapshot
  );
  if (!lost) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center p-6">
      <div className="hud-panel hud-panel--modal panel-enter flex w-[min(90vw,22rem)] flex-col gap-3 p-5 text-center">
        <h2 className="text-ink text-sm font-semibold">Graphics stopped</h2>
        <p className="text-dim text-xs">
          The browser took the graphics context back — usually another tab, or
          the device running short of memory. Nothing of yours is lost.
        </p>
        <button onClick={() => window.location.reload()} className="hud-chip hud-chip--primary">
          Reload
        </button>
      </div>
    </div>
  );
}
