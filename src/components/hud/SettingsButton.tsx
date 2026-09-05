"use client";

import { useEffect, useState } from "react";
import { SettingsDialog } from "./SettingsDialog";
import { useHudOverlay } from "@/lib/hud-overlay";

/**
 * The gear, and the dialog it owns.
 *
 * One component so that every HUD gets the same affordance in the same corner
 * without any of them holding the open/closed state — the three places this
 * appears would otherwise each grow their own copy of it.
 */
export function SettingsButton({
  className = "hud-chip",
  title,
}: {
  className?: string;
  /**
   * What the player is currently in — the world's name, or the race's code.
   *
   * Passed down to the dialog, which shows it as its subtitle. This used to be
   * a permanent panel in the HUD's top-left corner; it is here because a value
   * that cannot change while you play it is reference, not readout.
   */
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  /*
   * Mirrored into the overlay store so the touch controls can get out of the
   * way — they are fixed-position siblings of the HUD, not children of this
   * component, so there is no prop that reaches them. Published from an effect
   * rather than from the click handler so that the two can never disagree:
   * whatever closes the dialog (Escape, the scrim, Done, this component
   * unmounting on the way out of a world) ends with the flag matching.
   */
  useEffect(() => {
    useHudOverlay.getState().setSettings(open);
    return () => useHudOverlay.getState().setSettings(false);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className}
        aria-label="Settings"
        title="Settings"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <SettingsDialog title={title} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
