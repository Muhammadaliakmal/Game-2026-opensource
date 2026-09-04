"use client";

import { create } from "zustand";

/**
 * The player's own preferences — everything that is a choice rather than a
 * capability.
 *
 * Kept apart from `lib/quality.ts` (which measures the device and decides how
 * much to draw) and from `lib/keybinds.ts` (which is large enough to own its
 * own file). What is left is small, unrelated to each other, and shares only
 * the need to survive a reload: the HUD safe frame, the touch control scheme,
 * and whether the phone is allowed to buzz.
 */

/**
 * How the bike is steered by thumb.
 *
 * `assist` is the default because it is the one that works for someone who
 * picked the game up thirty seconds ago: the bike holds a line on its own and
 * the thumb nudges it. The other three are strictly better for someone who has
 * learned the track, which is exactly the wrong order to make a new player
 * discover them in — so they are offered, not imposed.
 */
export type RaceScheme = "assist" | "stick" | "tilt" | "tap";

export const RACE_SCHEMES: Record<
  RaceScheme,
  { name: string; blurb: string }
> = {
  assist: {
    name: "Assisted",
    blurb: "Steers itself out of walls. Nudge to aim.",
  },
  stick: { name: "Thumbstick", blurb: "A stick on the left, as before." },
  tilt: { name: "Tilt", blurb: "Turn the phone to steer." },
  tap: { name: "Tap", blurb: "Left and right pads. No stick." },
};

interface PlayerSettings {
  /**
   * Extra inset for every HUD zone, in CSS pixels, on top of the platform's
   * own safe area. Every console racer exposes one of these because TV
   * overscan and phone bezels are not something a page can detect.
   */
  hudInset: number;
  raceScheme: RaceScheme;
  /** Whether a control is allowed to buzz. Off is a legitimate preference. */
  haptics: boolean;
  hydrated: boolean;

  setHudInset(px: number): void;
  setRaceScheme(s: RaceScheme): void;
  setHaptics(on: boolean): void;
}

const STORAGE_KEY = "blockworld:settings:v1";

interface Stored {
  hudInset?: number;
  raceScheme?: RaceScheme;
  haptics?: boolean;
}

const DEFAULTS = {
  hudInset: 0,
  raceScheme: "assist" as RaceScheme,
  haptics: true,
};

/** The one place a stored value is allowed to be wrong. */
function sanitise(raw: Stored | null) {
  const inset = Number(raw?.hudInset);
  return {
    hudInset:
      Number.isFinite(inset) && inset >= 0 && inset <= 64
        ? Math.round(inset)
        : DEFAULTS.hudInset,
    raceScheme:
      raw?.raceScheme && raw.raceScheme in RACE_SCHEMES
        ? raw.raceScheme
        : DEFAULTS.raceScheme,
    haptics: typeof raw?.haptics === "boolean" ? raw.haptics : DEFAULTS.haptics,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return sanitise(raw ? (JSON.parse(raw) as Stored) : null);
  } catch {
    return sanitise(null);
  }
}

function save(s: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* the choice still applies for this session */
  }
}

export const usePlayerSettings = create<PlayerSettings>((set, get) => {
  const persist = () => {
    const { hudInset, raceScheme, haptics } = get();
    save({ hudInset, raceScheme, haptics });
  };

  return {
    // Read at creation. Every consumer lives under an `ssr:false` dynamic
    // import or inside a canvas, so there is no server render to mismatch.
    ...(typeof window === "undefined" ? DEFAULTS : load()),
    hydrated: typeof window !== "undefined",

    setHudInset: (px) => {
      set({ hudInset: Math.max(0, Math.min(64, Math.round(px))) });
      persist();
    },
    setRaceScheme: (raceScheme) => {
      set({ raceScheme });
      persist();
    },
    setHaptics: (haptics) => {
      set({ haptics });
      persist();
    },
  };
});

/**
 * A short buzz, if the device can and the player wants one.
 *
 * Called from pointer handlers, so it must never throw and never block:
 * `navigator.vibrate` is absent on iOS Safari entirely, and on Android it
 * throws if the page has not been interacted with — both of which are normal,
 * neither of which is worth a broken control.
 *
 * The durations are deliberately at the bottom of the useful range. A phone
 * that thumps on every input is a phone the player turns haptics off on, and
 * then they lose the one buzz that mattered.
 */
export const HAPTIC = {
  /** A control was pressed. */
  tap: 8,
  /** Something happened to you — a checkpoint, a hit, a boost firing. */
  event: 18,
  /** A failure worth feeling: falling out of the world, hitting a wall hard. */
  fail: 32,
} as const;

export function haptic(ms: number = HAPTIC.tap) {
  if (!usePlayerSettings.getState().haptics) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not available, not important */
  }
}
