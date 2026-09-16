"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { MuteButton } from "@/components/MuteButton";
import { ControlsHint, Hotkey } from "@/components/hud/Hotkey";
import { RewardBurst } from "@/components/hud/RewardBurst";
import { useShop } from "@/lib/shop";
import { useMediaQuery } from "@/lib/use-media-query";
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
  const placement = useArcade((s) => s.placement);
  const capped = useArcade((s) => s.capped);
  const error = useArcade((s) => s.error);
  /* The wallet after the payout. `GameHost.settle` writes the server's own
     number into this store, so the balance shown next to "+22" is the one the
     header is showing rather than a second guess at it. */
  const coins = useShop((s) => s.coins);

  const entry = gameId ? entryFor(gameId) : undefined;

  /**
   * A cabinet does not follow you off the page it was opened on.
   *
   * `useArcade` is a module singleton and survives client-side navigation, so
   * without this an open `activeGame` outlived the route that hosted it —
   * and it is read all over the app. It used to black out the race, the arena
   * and the shop's preview through FrameLimiter's bridge (fixed there too,
   * properly), and it would still re-open the cabinet over the next world you
   * loaded.
   *
   * Compared against the path it opened on rather than run as an unmount
   * cleanup, because React double-invokes effects in development: a cleanup
   * would close the cabinet on the same tick it was opened.
   */
  const pathname = usePathname();
  const openedOn = useRef(pathname);
  useEffect(() => {
    if (pathname !== openedOn.current) useArcade.getState().close();
  }, [pathname]);

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
      /*
        Opaque, and the word is load-bearing.

        This was `bg-black/90 backdrop-blur-sm`, which is a scrim rather than a
        shell: the site header stayed mounted underneath and ghosted straight
        through the game's own top bar, so "Home / Browse / Arcade / Characters
        / Get the app" was legible behind the cabinet's title for the whole
        run. A cabinet is a game taking over the screen, not a dialog floating
        on a web page, and 10% of a nav bar showing through is the single
        clearest signal that this is a website pretending.

        The safe-area padding is on the header and the footer rather than on
        this element, because the CANVAS should paint edge to edge under a
        notch — that is the half of `viewportFit: "cover"` that is right — and
        only the things you have to read need to stay inside it.
      */
      className="bg-base fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
    >
      {/* ── Chrome ── */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top, 0px))",
          paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="min-w-0">
          {/* `text-ink` explicitly. It inherited, and what it inherited from
              was a translucent shell over the page — so the title was the
              lowest-contrast text in the arcade, on the element naming the
              thing you are playing. */}
          <h2 className="text-ink truncate text-base font-semibold">
            {entry.title}
          </h2>
          <ControlsHint hint={entry.hint} className="hud-label truncate block" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* A board cabinet has no running total, and "0 · best 0" for four
              minutes is a readout that is wrong rather than merely useless.
              What is worth reading during a match — whose turn it is, what the
              dice said — is on the board itself, beside the pieces it is about. */}
          {!entry.board && (
            <>
              <span className="hud-readout num text-sm font-semibold">{score}</span>
              {bestScore > 0 && (
                <span className="hud-label num">best {bestScore}</span>
              )}
            </>
          )}
          {/* The cabinets have music now, and this screen covers the site
              header — which is where the only other mute button lives. A
              looping track with no visible way to stop it is worse than no
              track, so the control goes where the sound is. It is the app's
              own MuteButton, so it silences the whole game and agrees with
              every other copy of itself. */}
          <MuteButton className="hud-chip hud-chip--icon" />
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

        {status === "playing" && !entry.board && <RotateHint />}

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
            ) : placement ? (
              /* A placement, said as a placement. `RewardBurst` counts coins up
                 from a score, and a board cabinet has neither yet — see
                 `plan-phase8.md` §2B. Until it pays, showing a payout beat with
                 nothing in it would be worse than showing the result plainly. */
              <div className="flex flex-col items-center gap-1">
                <p className="text-display font-semibold">
                  {ordinal(placement.place)}
                </p>
                <p className="text-dim text-sm">of {placement.of} players</p>
              </div>
            ) : (
              /* The whole payoff beat, in one component shared with the course
                 finish. The coins count up rather than appearing: this is the
                 one moment in the loop with the player's undivided attention,
                 and it was spending it on a score and two buttons while the
                 currency the arcade exists to pay was credited silently. */
              <RewardBurst
                score={score}
                best={bestScore}
                earned={earned}
                balance={coins}
                capped={capped}
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="hud-chip hud-chip--primary"
                onClick={restart}
              >
                Again
                <Hotkey>R</Hotkey>
              </button>
              <button type="button" className="hud-chip" onClick={close}>
                Quit
                <Hotkey>Esc</Hotkey>
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/**
 * "2nd", not "Place 2".
 *
 * The whole result is one word, so it should be the word somebody would say.
 */
function ordinal(n: number): string {
  const suffix =
    n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

/** The one panel shape every non-playing state uses. */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center backdrop-blur-[2px]">
      {children}
    </div>
  );
}

/**
 * "Turn your phone sideways", for a letterboxed cabinet held upright.
 *
 * Every cabinet since Chunk Runner draws a fixed 960×540 view (see
 * `view.ts`), so on a portrait phone the room is fitted to the screen's
 * width and comes out at two-fifths scale, with the in-room text under the
 * size anyone can read. The board cabinets lay themselves out for portrait
 * and are excluded. The hint sits in the empty letterbox above the room, so
 * it covers nothing, and it takes no pointer events, because in Gravity
 * Shift the whole screen is the compass and a line of text that ate a tap
 * would flip the room the wrong way. Not a lock: `screen.orientation.lock`
 * needs fullscreen on most browsers and is refused on iOS, and a page that
 * fights the phone's rotation loses.
 */
function RotateHint() {
  const upright = useMediaQuery("(orientation: portrait) and (pointer: coarse)");
  if (!upright) return null;
  return (
    <p
      className="hud-label pointer-events-none absolute inset-x-0 top-3 text-center"
      aria-live="polite"
    >
      <span aria-hidden="true">⟳ </span>
      Turn your phone sideways for a bigger room
    </p>
  );
}
