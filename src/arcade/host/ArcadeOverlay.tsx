"use client";

import { useEffect } from "react";
import { GameHost } from "./GameHost";
import { useArcade } from "../store";
import { entryFor } from "../registry";

/**
 * Everything around the game that is not the game.
 *
 * ── DOM, not the WebGL scene ─────────────────────────────────────────────
 *
 * Rendering a minigame to a texture on the cabinet's screen would look better
 * in a screenshot and be worse in every other way: both render loops would be
 * running at once — the exact thing this feature is built to avoid — and the
 * text would be a blurry sample of a 256-pixel texture instead of type. The
 * cabinet gets an attract loop; the game gets the whole screen.
 *
 * ── Three keys, and no menus behind them ─────────────────────────────────
 *
 * `R` restarts with nothing in the way, because the death screen *is* the
 * menu and a run of this length cannot afford a confirmation. `Esc` quits.
 * `P` pauses. A player who has just died is holding the key that killed them,
 * so the restart is bound on keydown and reads an edge, not a level.
 */
export default function ArcadeOverlay() {
  const gameId = useArcade((s) => s.activeGame);
  const status = useArcade((s) => s.status);
  const score = useArcade((s) => s.score);
  const best = useArcade((s) => s.best);
  const earned = useArcade((s) => s.earned);
  const error = useArcade((s) => s.error);

  const entry = gameId ? entryFor(gameId) : undefined;

  // Keys. Bound while the overlay is up and gone the moment it is not, so the
  // world never sees an `R` meant for a cabinet.
  useEffect(() => {
    if (!gameId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useArcade.getState();
      if (e.code === "Escape") s.close();
      else if (e.code === "KeyR") s.restart();
      else if (e.code === "KeyP") {
        if (s.status === "playing") s.pause();
        else if (s.status === "paused") s.resume();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameId]);

  // The page behind the overlay must not scroll, and the world must not still
  // be capturing the mouse. Both are reversed on the way out, in the same
  // effect, so a close can never leave one of them applied.
  useEffect(() => {
    if (!gameId) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (document.pointerLockElement) document.exitPointerLock();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [gameId]);

  if (!gameId || !entry) return null;

  const bestScore = best[entry.id] ?? 0;
  const close = () => useArcade.getState().close();
  const restart = () => useArcade.getState().restart();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
    >
      {/* ── Chrome ── */}
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{entry.title}</h2>
          <p className="hud-label truncate">{entry.controlsHint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hud-readout num text-sm font-semibold">{score}</span>
          {bestScore > 0 && (
            <span className="hud-label num">best {bestScore}</span>
          )}
          <button type="button" className="hud-chip" onClick={close}>
            Quit
          </button>
        </div>
      </header>

      {/* ── The game ──
          `flex-1 min-h-0` rather than a fixed size: the canvas measures itself
          off this box, and a min-height of auto would let it grow past the
          viewport on a short screen and never shrink back. */}
      <div className="relative min-h-0 flex-1">
        <GameHost className="h-full w-full" />

        {status === "loading" && !error && (
          <Panel>
            <p className="text-dim text-sm">Loading {entry.title}…</p>
          </Panel>
        )}

        {status === "paused" && (
          <Panel>
            <h3 className="text-lg font-semibold">Paused</h3>
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-chip hud-chip--primary"
                onClick={() => useArcade.getState().resume()}
              >
                Resume
              </button>
              <button type="button" className="hud-chip" onClick={close}>
                Quit
              </button>
            </div>
          </Panel>
        )}

        {status === "gameover" && (
          <Panel>
            {error ? (
              <p className="text-danger max-w-xs text-sm font-semibold">{error}</p>
            ) : (
              <>
                <h3 className="text-lg font-semibold">
                  {score > 0 && score >= bestScore ? "New best" : "Run over"}
                </h3>
                <p className="hud-readout num text-2xl font-bold">{score}</p>
                {/* Only when something was actually earned — the same rule the
                    course finish panel follows. A day past its ceiling pays
                    nothing, and printing "+0" would read as a bug. */}
                {earned !== null && earned > 0 && (
                  <p className="text-accent num text-sm font-semibold">
                    + ⬤ {earned}
                  </p>
                )}
              </>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-chip hud-chip--primary"
                onClick={restart}
              >
                Again · R
              </button>
              <button type="button" className="hud-chip" onClick={close}>
                Quit · Esc
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/** The one panel shape every non-playing state uses. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-center">
      {children}
    </div>
  );
}
