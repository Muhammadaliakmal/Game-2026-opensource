"use client";

import { useSyncExternalStore } from "react";
import { isMuted, onMuteChange, primeAudio, setMuted } from "@/lib/audio";

/**
 * Global sound toggle.
 *
 * The game synthesises footsteps, landings and placement clicks, and until now
 * there was no way to turn any of it off — which matters when someone is
 * building in a room with other people in it. The choice persists across
 * sessions, and every mounted button tracks the shared state, so the editor
 * and Play HUDs can never disagree.
 */
export function MuteButton({
  className,
  /** Renders beside the icon. Omitted, this stays the square icon button the
   *  editor toolbar wants; supplied, it becomes a readable menu row. */
  label,
}: {
  className?: string;
  label?: string;
}) {
  // The mute flag is external state (a module singleton backed by
  // localStorage), so it is subscribed to rather than mirrored into component
  // state — which also gives the server snapshot for free, so this renders
  // "unmuted" on the server and corrects itself on hydration without a flash
  // of the wrong icon or a cascading render.
  const muted = useSyncExternalStore(
    onMuteChange,
    () => isMuted(),
    () => false
  );

  return (
    <button
      onClick={() => {
        // A click is a user gesture — the one moment the browser will let the
        // audio graph start, so unmuting here actually produces sound.
        primeAudio();
        setMuted(!muted);
      }}
      className={className}
      title={muted ? "Sound off — click to unmute" : "Sound on — click to mute"}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {muted ? (
          <path d="m17 9 4 6M21 9l-4 6" />
        ) : (
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        )}
      </svg>
      {label && <span>{muted ? `${label} off` : `${label} on`}</span>}
    </button>
  );
}
