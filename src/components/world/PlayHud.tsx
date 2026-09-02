"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { recenterPitch, useViewStore } from "@/components/play/camera-rig";
import { useMoveMode } from "@/components/play/move-mode";
import { onRespawned, requestRespawn } from "@/components/play/play-actions";
import { FullscreenButton } from "@/components/FullscreenButton";
import { MuteButton } from "@/components/MuteButton";
import { RemixButton } from "@/components/RemixButton";

/**
 * The Play HUD.
 *
 * Deliberately close to nothing (UI spec §3.3): a platformer's screen belongs
 * to the world, not to chrome. What is here is what cannot be discovered by
 * pressing something — the view toggle, respawn, and the way back out.
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
  const firstPerson = useViewStore((s) => s.firstPerson);
  const toggleFirstPerson = useViewStore((s) => s.toggleFirstPerson);

  // Leaving the game while still fullscreen strands the user in a chromeless
  // window, so drop out of it on the way to another route.
  const leaveFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
  };

  return (
    <>
      <RespawnFade />
      {canEdit && <EscHint />}
      <LockOnBadge />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-2 p-2 sm:flex-row sm:flex-wrap sm:justify-between sm:p-3">
        <div className="hud-panel pointer-events-auto flex max-w-full min-w-0 items-center gap-2.5 px-3 py-2">
          <span className="bg-signal h-1.5 w-1.5 shrink-0" aria-hidden />
          <span className="truncate text-2xs font-medium">{name}</span>
        </div>

        <div className="hud-scroll pointer-events-auto flex max-w-full overflow-x-auto sm:overflow-visible">
          <div className="hud-panel flex shrink-0 items-center gap-1.5 p-1.5">
            <button
              onClick={toggleFirstPerson}
              className={`hud-chip ${firstPerson ? "is-active" : ""}`}
              title="Switch between first and third person (V)"
              aria-pressed={firstPerson}
            >
              {firstPerson ? "1st" : "3rd"}
            </button>
            <button
              onClick={recenterPitch}
              className="hud-chip"
              title="Level the view (C)"
              aria-label="Level the view"
            >
              ⌖
            </button>
            <button
              onClick={requestRespawn}
              className="hud-chip"
              title="Back to the start (R)"
            >
              Respawn
            </button>
            <span className="hud-divider" />
            <MuteButton className="hud-chip" />
            <FullscreenButton className="hud-chip" />
            <span className="hud-divider" />
            {canEdit ? (
              // No navigation: the editor is the same canvas, one mode away.
              <button onClick={onEdit} className="hud-chip" title="Back to building (Esc)">
                Edit
              </button>
            ) : (
              // Someone who just played a world they like should be one click
              // from building on it — that fork is the whole share loop.
              !isDraft && <RemixButton from={worldId} name={name} />
            )}
            <Link
              href="/"
              onClick={leaveFullscreen}
              className="hud-chip"
              title="Leave the game"
            >
              Exit
            </Link>
          </div>
        </div>
      </div>

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
