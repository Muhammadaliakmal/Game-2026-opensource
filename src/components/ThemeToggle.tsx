"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_PREFS,
  getThemePref,
  setThemePref,
  subscribeThemePref,
  type ThemePref,
} from "@/lib/theme";

/**
 * The theme control, in the site header.
 *
 * In the header rather than in Settings because Settings opens from inside a
 * game, and a game is the one screen the theme never reaches (see
 * `lib/theme.ts`) — a switch whose effect you cannot see from where you
 * pressed it reads as broken.
 *
 * Two forms, like the header itself: one icon on the desktop row that steps
 * through the three, and a labelled three-way choice in the phone menu, which
 * has the width to say all of them at once.
 */

const LABEL: Record<ThemePref, string> = { system: "Auto", light: "Light", dark: "Dark" };

function usePref(): ThemePref {
  return useSyncExternalStore(subscribeThemePref, getThemePref, () => "system");
}

export function ThemeToggle({ variant = "row" }: { variant?: "row" | "menu" }) {
  const pref = usePref();

  if (variant === "menu") {
    return (
      <div className="flex items-center gap-2 px-2 py-1" role="radiogroup" aria-label="Theme">
        <span className="hud-label mr-auto">Theme</span>
        {THEME_PREFS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={pref === p}
            onClick={() => setThemePref(p)}
            className={`hud-chip hud-chip--touch ${pref === p ? "is-active" : ""}`}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>
    );
  }

  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length];
  return (
    <button
      type="button"
      onClick={() => setThemePref(next)}
      className="hud-chip hud-chip--icon"
      title={`Theme: ${LABEL[pref]} (switch to ${LABEL[next]})`}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`}
    >
      <ThemeIcon pref={pref} />
    </button>
  );
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {pref === "light" ? (
        <>
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
        </>
      ) : pref === "dark" ? (
        <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" />
      ) : (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5z" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}
