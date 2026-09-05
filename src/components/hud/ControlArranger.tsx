"use client";

import { useEffect } from "react";
import { useHudOverlay } from "@/lib/hud-overlay";
import { useControlLayout } from "@/lib/control-layout";

/**
 * The bar that appears while the player is arranging their touch controls.
 *
 * ── Why it is a bar and not a dialog ─────────────────────────────────────
 *
 * The thing being edited is where a button falls under a thumb, and that can
 * only be judged while holding the phone the way you hold it to play. A modal
 * would cover the exact screen the answer depends on. So this takes the top
 * strip, the controls stay live underneath, and the world keeps running behind
 * both — which is also why `laying` deliberately does not set `blocked` in
 * lib/hud-overlay: every other overlay hides the controls, and this one is the
 * single case that must not.
 *
 * ── Why the world keeps running ──────────────────────────────────────────
 *
 * It would be tidier to freeze it. It would also be wrong: a control that
 * feels right on a stationary character is not the same control at speed with
 * the camera moving, and the whole point of arranging over the live game
 * rather than over a mockup is that the judgement is made under the conditions
 * it has to hold up in.
 */
export function ControlArranger() {
  const laying = useHudOverlay((s) => s.laying);
  const setLaying = useHudOverlay((s) => s.setLaying);
  const layout = useControlLayout((s) => s.layout);
  const reset = useControlLayout((s) => s.reset);

  const count = Object.keys(layout).length;

  // Escape leaves the editor. Bound in the capture phase for the same reason
  // the menu binds it there: WorldCanvas has its own window-level Escape
  // handler that drops out of Play, and arranging controls must not exit the
  // world as a side effect of finishing.
  useEffect(() => {
    if (!laying) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setLaying(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [laying, setLaying]);

  // Leaving the world while still in the editor would strand the next one in
  // it — the flag lives in a store that outlives this component.
  useEffect(() => () => useHudOverlay.getState().setLaying(false), []);

  if (!laying) return null;

  return (
    <div
      className="panel-enter pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + var(--hud-inset, 0px) + 12px)",
      }}
    >
      <div className="hud-panel pointer-events-auto flex items-center gap-2 px-3 py-2">
        <span className="hud-label shrink-0">Arrange</span>
        <span className="text-dim hidden text-2xs sm:inline">
          Drag any control. Size them in Settings.
        </span>
        <button
          onClick={reset}
          disabled={count === 0}
          className="hud-chip ml-1 shrink-0"
          title="Put every control back where it started"
        >
          Reset
        </button>
        <button
          onClick={() => setLaying(false)}
          className="hud-chip hud-chip--primary shrink-0"
          autoFocus
        >
          Done
        </button>
      </div>
    </div>
  );
}
