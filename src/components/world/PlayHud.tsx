"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { recenterPitch, useViewStore } from "@/components/play/camera-rig";
import { useMoveMode } from "@/components/play/move-mode";
import { onRespawned, requestRespawn } from "@/components/play/play-actions";
import { formatTime, useCourse } from "@/components/play/course";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { RemixButton } from "@/components/RemixButton";

/**
 * The Play HUD.
 *
 * Deliberately close to nothing (UI spec §3.3): a platformer's screen belongs
 * to the world, not to chrome. Everything that is not the world now sits
 * behind one icon — on a phone the old row of chips ran the full width under
 * the world name and took roughly a third of the screen, which is a lot of a
 * game to spend on controls nobody touches while actually playing.
 *
 * DOM rather than in-scene UI, and `pointer-events-none` on the container with
 * each control re-enabling itself, so invisible padding can never swallow a
 * click meant for the world.
 */
export function PlayHud({
  name,
  canEdit,
  worldId,
  isDraft,
  onEdit,
  showKeyboardLegend,
}: {
  name: string;
  canEdit: boolean;
  worldId: string;
  isDraft: boolean;
  onEdit: () => void;
  showKeyboardLegend: boolean;
}) {
  return (
    <>
      <RespawnFade />
      {canEdit && <EscHint />}
      <LockOnBadge />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <div className="hud-panel flex min-w-0 items-center gap-2.5 px-3 py-2">
            <span className="bg-signal h-1.5 w-1.5 shrink-0" aria-hidden />
            <span className="truncate text-2xs font-medium">{name}</span>
          </div>
          <RunTimer />
        </div>

        <PlayMenu
          name={name}
          canEdit={canEdit}
          worldId={worldId}
          isDraft={isDraft}
          onEdit={onEdit}
        />
      </div>

      <CourseComplete canEdit={canEdit} onEdit={onEdit} />

      {/* The keyboard legend is noise once thumb controls are on screen — and
          it would sit right under the joystick. */}
      {showKeyboardLegend && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2 sm:p-3">
          <div className="hud-panel flex items-center gap-2.5 px-3.5 py-2">
            {[
              ["WASD", "move"],
              ["Click", "aim"],
              ["Shift", "lock on"],
              ["Space", "jump"],
              ["V", "view"],
              ["R", "respawn"],
            ].map(([key, action]) => (
              <span key={key} className="flex items-center gap-1.5">
                <kbd className="bg-steel-800 text-steel-050 rounded-[var(--radius)] px-1.5 py-0.5 font-mono text-[0.6875rem] ring-1 ring-white/10">
                  {key}
                </kbd>
                <span className="hud-label">{action}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The run clock, for worlds that are courses.
 *
 * Ticks on an interval rather than a frame loop: the display only changes in
 * hundredths, a 60Hz re-render of a DOM node would be 55 wasted renders a
 * second, and the clock itself is a timestamp in the store — this only decides
 * how often anyone looks at it.
 */
function RunTimer() {
  const startedAt = useCourse((s) => s.startedAt);
  const finishedMs = useCourse((s) => s.finishedMs);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null || finishedMs !== null) return;
    // The clock is read here and never during render. A render may happen at
    // any moment for reasons that have nothing to do with time, and it has to
    // produce the same output for the same state — so the elapsed value is
    // sampled on a schedule we control and held in state.
    const id = setInterval(
      () => setElapsed(performance.now() - startedAt),
      60
    );
    return () => clearInterval(id);
  }, [startedAt, finishedMs]);

  if (startedAt === null) return null;
  const ms = finishedMs ?? elapsed;

  return (
    <div className="hud-panel flex shrink-0 items-center px-3 py-2">
      <span className="tabular text-2xs font-medium">{formatTime(ms)}</span>
    </div>
  );
}

/**
 * The end of a run.
 *
 * A panel rather than the wash used for respawns: SPEC bans modals for things
 * that interrupt play, and this is the opposite case — play is over, and the
 * one moment a course has earned the screen is the moment you finish it.
 *
 * It does not stop the character. You keep control of the world behind it, so
 * the panel is a result and not a cage, and "Run again" is a respawn rather
 * than a reload — the same quarter-second cost as any other attempt.
 */
function CourseComplete({
  canEdit,
  onEdit,
}: {
  canEdit: boolean;
  onEdit: () => void;
}) {
  const finishedMs = useCourse((s) => s.finishedMs);
  const best = useCourse((s) => s.best);
  if (finishedMs === null) return null;

  const isBest = best !== null && Math.abs(best - finishedMs) < 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="hud-panel panel-enter pointer-events-auto flex w-full max-w-xs flex-col items-center gap-4 px-6 py-6 text-center">
        <div className="flex flex-col items-center gap-1">
          <span className="hud-label">Course complete</span>
          <span className="text-signal tabular text-3xl font-semibold">
            {formatTime(finishedMs)}
          </span>
        </div>

        {/* A best time only means something once there is a previous one to
            beat, so the first run says nothing rather than congratulating
            itself for being the only entry. */}
        {best !== null && (
          <span className="hud-label">
            {isBest ? "New best time" : `Best ${formatTime(best)}`}
          </span>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={requestRespawn}
            className="hud-chip hud-chip--primary"
            autoFocus
          >
            Run again
          </button>
          {canEdit && (
            <button onClick={onEdit} className="hud-chip">
              Edit
            </button>
          )}
          <Link href="/" className="hud-chip">
            Exit
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Everything that used to be a chip in the top bar.
 *
 * One-shot actions close the menu on their way out — you asked for a thing and
 * the chrome's job is finished. Toggles deliberately leave it open, because
 * the reason to open a menu for a toggle is usually to change it and look, and
 * having to reopen it to flip back is the annoying half of that interaction.
 */
function PlayMenu({
  name,
  canEdit,
  worldId,
  isDraft,
  onEdit,
}: {
  name: string;
  canEdit: boolean;
  worldId: string;
  isDraft: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const firstPerson = useViewStore((s) => s.firstPerson);
  const toggleFirstPerson = useViewStore((s) => s.toggleFirstPerson);

  // Leaving the game while still fullscreen strands the user in a chromeless
  // window, so drop out of it on the way to another route.
  const leaveFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
  };

  /** Run a one-shot action and get the chrome back off the screen. */
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  useEffect(() => {
    if (!open) return;

    /**
     * Esc closes the menu, and must not also leave Play.
     *
     * WorldCanvas binds Escape on `window` to drop back into the editor, so
     * without this one key would do both. Bound in the CAPTURE phase, which
     * precedes every bubble listener in the dispatch, so stopping propagation
     * here reliably wins — leaning on React effect ordering (a child's effect
     * runs before its parent's) would happen to work today and break silently
     * the moment the tree is reorganised.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
      trigger.current?.focus();
    };

    /** A press anywhere else — including on the world itself — dismisses it. */
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="pointer-events-auto relative shrink-0">
      <button
        ref={trigger}
        onClick={() => setOpen((v) => !v)}
        className={`hud-chip ${open ? "is-active" : ""}`}
        aria-expanded={open}
        aria-controls="play-menu"
        aria-label="Game menu"
        title="Game menu"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        {/* The word is affordance on a desktop and clutter on a phone, where
            the icon is doing the job and every pixel is world. */}
        <span className="hidden sm:inline">Menu</span>
      </button>

      {open && (
        /*
          A disclosure, not a `role="menu"`. A real menu promises arrow-key
          roving focus, and two of these rows are shared components that take
          a className and nothing else — so half of them could never carry
          `role="menuitem"` anyway. Plain buttons in a labelled panel are
          honest about what they are and Tab already works on them.
        */
        <div
          id="play-menu"
          aria-label="Game menu"
          className="hud-panel panel-enter absolute top-full right-0 mt-1.5 flex w-52 flex-col p-1.5"
        >
          <button
            onClick={toggleFirstPerson}
            className={`hud-menu-item ${firstPerson ? "is-active" : ""}`}
            title="Switch between first and third person (V)"
          >
            View
            <span className="hud-menu-state">
              {firstPerson ? "First person" : "Third person"}
            </span>
          </button>
          <button
            onClick={act(recenterPitch)}
            className="hud-menu-item"
            title="Level the view (C)"
          >
            Level the view
          </button>
          <button
            onClick={act(requestRespawn)}
            className="hud-menu-item"
            title="Back to the start (R)"
          >
            Respawn
          </button>

          <div className="hud-menu-sep" aria-hidden />

          <MuteButton className="hud-menu-item" label="Sound" />
          <FullscreenButton className="hud-menu-item" label="Fullscreen" />

          <div className="hud-menu-sep" aria-hidden />

          {canEdit ? (
            // No navigation: the editor is the same canvas, one mode away.
            <button
                onClick={act(onEdit)}
              className="hud-menu-item"
              title="Back to building (Esc)"
            >
              Edit
            </button>
          ) : (
            // Someone who just played a world they like should be one click
            // from building on it — that fork is the whole share loop.
            !isDraft && (
              <RemixButton from={worldId} name={name} className="hud-menu-item" />
            )
          )}
          <Link
            href="/"
            onClick={() => {
              setOpen(false);
              leaveFullscreen();
            }}
            className="hud-menu-item"
            title="Leave the game"
          >
            Exit
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * The lock-on readout.
 *
 * Shift changes how the character relates to the camera, and a mode you can
 * enter by accident and cannot see is a mode that reads as a bug — the player
 * strafes past a ledge wondering why the body will not turn. One chip, only
 * while it is on, in the corner the thumb controls do not use.
 */
function LockOnBadge() {
  const lockedOn = useMoveMode((s) => s.lockedOn);
  if (!lockedOn) return null;

  return (
    // top-28, not top-16: the "Esc to edit" hint owns that row for its first
    // three seconds, and two overlapping panels read as a rendering fault.
    <div className="pointer-events-none absolute inset-x-0 top-28 flex justify-center px-3">
      <div className="hud-panel border-signal/60 text-signal flex items-center gap-2 border px-3 py-1.5 text-2xs font-semibold tracking-widest">
        <span className="bg-signal h-1.5 w-1.5 animate-pulse rounded-full" aria-hidden />
        LOCK ON
      </div>
    </div>
  );
}

/** "Esc to edit", once, then out of the way. */
function EscHint() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-16 flex justify-center px-3 transition-opacity duration-500 ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="hud-panel text-steel-200 px-3 py-2 text-2xs">
        Esc to edit
      </div>
    </div>
  );
}

/**
 * A brief wash on respawn instead of a modal.
 *
 * UI spec §3.3 is explicit that a modal kills the flow of a platformer, and
 * SPEC §8 puts the respawn delay at a quarter of a second precisely so failure
 * costs nothing. Anything that has to be dismissed would cost more than the
 * fall did.
 */
function RespawnFade() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onRespawned(() => {
      setVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 180);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);

  return (
    <div
      aria-hidden
      className={`bg-steel-900 pointer-events-none absolute inset-0 z-10 transition-opacity duration-200 ${
        visible ? "opacity-60" : "opacity-0"
      }`}
    />
  );
}
