"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { MuteButton } from "@/components/MuteButton";
import { ControlsHint, Hotkey } from "@/components/hud/Hotkey";
import { RewardBurst } from "@/components/hud/RewardBurst";
import { useShop } from "@/lib/shop";
import { useMediaQuery } from "@/lib/use-media-query";
import { usePlayCount } from "@/lib/use-play-count";
import { isKnownSlug } from "@/content/registry";
import { GameHost } from "./GameHost";
import { RewardedDouble } from "./RewardedDouble";
import { RewardedContinue } from "./RewardedContinue";
import { breakBeforeRun } from "@/lib/game-ads";
import { lockZoom } from "./zoom-lock";
import { useArcade } from "../store";
import { entryFor } from "../registry";
import { VersusResults, VersusStrip } from "@/components/party/Versus";
import { partyGame } from "@/lib/party-games";
import {
  FIGHT_PACKS,
  FIGHT_PACK_LABEL,
  getFightPack,
  setFightPack,
  subscribeFightPack,
  type FightPack,
} from "../sound-pack";

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
  const canRevive = useArcade((s) => s.canRevive);
  const runId = useArcade((s) => s.runId);
  const reviveTick = useArcade((s) => s.reviveTick);
  const error = useArcade((s) => s.error);
  /* A party round (`plan-phase11.md`): the seed is everyone's, so there is no
     restart and no continue, and the standings stand where Again would. */
  const versus = useArcade((s) => s.versus);
  /* The wallet after the payout. `GameHost.settle` writes the server's own
     number into this store, so the balance shown next to "+22" is the one the
     header is showing rather than a second guess at it. */
  const coins = useShop((s) => s.coins);

  const entry = gameId ? entryFor(gameId) : undefined;

  /*
   * Ten seconds of actual play, once per cabinet per tab session.
   *
   * `status === "playing"` is the cabinet's own pause state, and it is the
   * reason this call is here rather than on the arcade page: the page cannot
   * see it, and a run that was paused for five minutes on the pause screen is
   * not five minutes of play. The hook adds the half every screen shares, a
   * hidden tab, so neither this nor `GameHost` has to repeat it.
   *
   * The allowlist check is here rather than left to the route, because the
   * host's own test pattern is a cabinet the site does not ship: it is in
   * `arcade/registry` and deliberately not in `content/registry`. The route
   * would refuse it anyway, and refusing it here means not making the request.
   */
  usePlayCount(isKnownSlug(gameId) ? gameId : null, status === "playing");

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
      // At the results screen R is the same press as "Again", natural break
      // and all; mid-run it is a plain restart and never an ad.
      else if (e.code === "KeyR") {
        if (s.versus) return;
        if (s.status === "gameover") breakBeforeRun(() => useArcade.getState().restart());
        else s.restart();
      }
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
    // A two-thumb fight is a pinch to the browser. See zoom-lock.ts.
    const unlockZoom = lockZoom();
    return () => {
      document.body.style.overflow = overflow;
      unlockZoom();
    };
  }, [gameId]);

  if (!gameId || !entry) return null;

  const bestScore = best[entry.id] ?? 0;
  const close = () => useArcade.getState().close();
  const restart = () => useArcade.getState().restart();
  // "Again" is the one natural break between runs, so it is where an
  // interstitial may go — paced in lib/game-ads-policy.ts, and the next run
  // starts whether or not one showed.
  const again = () => breakBeforeRun(restart);

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
      className="cabinet-enter bg-base fixed inset-0 z-50 flex flex-col"
      // A cabinet is a game, and games are dark whatever the site's theme —
      // the light tokens step aside while this is in the document (tokens.css).
      data-dark
      // Nothing on this screen scrolls or zooms; every touch belongs to the game.
      style={{ touchAction: "none" }}
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
    >
      {/* ── Chrome ── */}
      <header
        className="cabinet-chrome flex items-center justify-between gap-3 px-4 py-3"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top, 0px))",
          paddingLeft: "max(16px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="cabinet-title min-w-0">
          {/* `text-ink` explicitly. It inherited, and what it inherited from
              was a translucent shell over the page — so the title was the
              lowest-contrast text in the arcade, on the element naming the
              thing you are playing.

              One line. The controls used to sit under it as a second, and on
              a phone that row held a title, a truncated sentence, a score, a
              best, a mute and a Quit — the controls were cut off mid-word on
              exactly the screen that needed them. They are said over the
              game when a run starts and again on the pause screen. */}
          <h2 className="text-ink truncate text-base font-semibold">
            {entry.title}
          </h2>
        </div>
        <div className="cabinet-actions flex shrink-0 items-center gap-2">
          {/* A board cabinet has no running total, and "0 · best 0" for four
              minutes is a readout that is wrong rather than merely useless.
              What is worth reading during a match — whose turn it is, what the
              dice said — is on the board itself, beside the pieces it is about. */}
          {/* A party duel is ranked by who won, so it has no number either. */}
          {!entry.board && !(versus && partyGame(entry.id)?.kind !== "score") && (
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
        {/* Hidden while the cabinet loads — the canvas has nothing on it
            yet — and turned on like a tube when it is ready. See
            `.cabinet-reveal`. */}
        <div className={`h-full w-full ${status === "loading" ? "opacity-0" : "cabinet-reveal"}`}>
          <GameHost className="h-full w-full" />
        </div>

        {status === "playing" && !entry.board && <RotateHint />}

        {versus && status !== "loading" && status !== "gameover" && <VersusStrip />}

        {/* Keyed on the run, so every Again says the controls once more. */}
        {status === "playing" && <StartHint key={runId} hint={entry.hint} />}

        {/* The title card: the cabinet's name, what it is, and the site's
            loader row (`GameLoader`'s blocks, the same rhythm as every other
            load). This is the moment the player is looking at a name they
            just chose; it should say it like a title, not like a status. */}
        {status === "loading" && !error && (
          <Panel>
            <div className="cabinet-card flex flex-col items-center gap-4" role="status">
              <p className="text-display text-ink font-semibold">{entry.title}</p>
              <p className="text-dim max-w-xs text-sm">{entry.tagline}</p>
              <div className="flex items-end gap-1.5" aria-hidden>
                {Array.from({ length: 8 }, (_, i) => (
                  <span
                    key={i}
                    className="loader-block"
                    style={{ animationDelay: `${i * 0.11}s` }}
                  />
                ))}
              </div>
              <span className="sr-only">Loading {entry.title}</span>
            </div>
          </Panel>
        )}

        {status === "paused" && (
          <Panel>
            <h3 className="text-lg font-semibold">Paused</h3>
            <ControlsHint hint={entry.hint} className="text-dim max-w-xs text-sm" />
            {entry.soundPacks && <FightPackPicker />}
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
            {/* Only on a run that paid. `capped` is read once, when the
                offer is made: a day already at its ceiling gets no offer (an
                ad watched for nothing), and a bonus that fills the day does
                not take its own receipt off the screen. */}
            {/* A run that can still continue is offered that, and nothing
                else: two rewarded placements at once is one Google declines,
                and a second chance beats a few coins. Its own death screen
                after the continue offers the double. Keyed on the run so a
                fresh death asks Google afresh. */}
            {!error && !placement && canRevive && !versus ? (
              <RewardedContinue key={`${runId}-${reviveTick}`} />
            ) : (
              !error &&
              !placement &&
              earned !== null &&
              earned > 0 && <RewardedDouble earned={earned} capped={capped} />
            )}
            {versus ? (
              <VersusResults />
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="hud-chip hud-chip--primary"
                  onClick={again}
                >
                  Again
                  <Hotkey>R</Hotkey>
                </button>
                <button type="button" className="hud-chip" onClick={close}>
                  Quit
                  <Hotkey>Esc</Hotkey>
                </button>
              </div>
            )}
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
    <div className="cabinet-results absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  );
}

/**
 * The fight-sound pack, on the pause screen: the one place a player is
 * already choosing things and nothing is moving. Each press plays the next
 * pack's hit through the cabinet on the next punch — `sound-pack.ts` is read
 * per call, so there is nothing to restart.
 */
function FightPackPicker() {
  const pack = useSyncExternalStore(subscribeFightPack, getFightPack, () => "metal" as FightPack);
  return (
    <div className="flex flex-col items-center gap-2" role="radiogroup" aria-label="Fight sounds">
      <span className="hud-label">Fight sounds</span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {FIGHT_PACKS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pack === p}
            onClick={() => setFightPack(p)}
            className={`hud-chip hud-chip--touch ${pack === p ? "is-active" : ""}`}
          >
            {FIGHT_PACK_LABEL[p]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * How to play, over the first seconds of a run.
 *
 * Low in the room, where the thumbs are going anyway, and pointer-transparent
 * for the reason RotateHint is: in Gravity Shift the whole screen is the
 * compass. It fades itself out in CSS (`.arcade-start-hint`), so nothing has
 * to count seconds or be dismissed.
 */
function StartHint({ hint }: { hint: { touch: string; keys: string } }) {
  return (
    <p className="arcade-start-hint pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
      <ControlsHint hint={hint} className="hud-chip whitespace-normal text-center" />
    </p>
  );
}

const ROTATE_DISMISSED_KEY = "sdg_arcade_rotate_dismissed";

/**
 * "Turn your phone sideways", for a letterboxed cabinet held upright.
 *
 * Every cabinet since Chunk Runner draws a fixed 960×540 view (see
 * `view.ts`), so on a portrait phone the room is fitted to the screen's
 * width and comes out at two-fifths scale, with the in-room text under the
 * size anyone can read. The board cabinets lay themselves out for portrait
 * and are excluded.
 *
 * Where the browser allows it, opening the cabinet already turned the screen
 * (`orientation.ts`) and this never shows. It is what is left where it does
 * not — iPhone, which has neither element fullscreen nor an orientation lock,
 * and a cabinet opened from a link with no press behind it.
 *
 * It was a line that stayed for the whole run, on every run, and a player who
 * had decided to play upright was told otherwise forever. Now it can be put
 * away once, for good. The line is still pointer-transparent — in Gravity
 * Shift the whole screen is the compass — and only the close button takes a
 * tap. It sits in the empty letterbox above the room, so it covers nothing.
 *
 * Storage is read once in a lazy initialiser, as `DiscordNudge` does and for
 * its reason: a one-shot decision that must not change while it is on screen.
 */
function RotateHint() {
  const upright = useMediaQuery("(orientation: portrait) and (pointer: coarse)");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(ROTATE_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (!upright || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(ROTATE_DISMISSED_KEY, "1");
    } catch {
      /* Hidden for this session either way. */
    }
    setDismissed(true);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
      <p className="hud-chip gap-2 whitespace-normal" aria-live="polite">
        <span aria-hidden="true">⟳</span>
        Turn your phone sideways for a bigger room
        <button
          type="button"
          onClick={dismiss}
          className="pointer-events-auto -my-2 -mr-2 grid min-h-12 min-w-12 place-items-center"
          aria-label="Don't show this again"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </p>
    </div>
  );
}
