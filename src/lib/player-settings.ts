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
 * `tap` is the default: two pads, and the bike goes where the rider points it
 * and nowhere else.
 *
 * `assist` held that place and does not any more. It steers the bike round the
 * track on its own, and to a rider who never went looking for it that is not a
 * feature, it is the bike driving itself — which is exactly how it was
 * reported. A default that has to be explained before it stops looking like a
 * bug is the wrong default, however good it is for the player it was written
 * for. It is still here, still worth having on a six-inch screen, and now it
 * is chosen in Settings, where choosing it is a decision rather than a
 * discovery.
 */
export type RaceScheme = "assist" | "stick" | "tilt" | "tap";

export const RACE_SCHEMES: Record<
  RaceScheme,
  { name: string; blurb: string }
> = {
  assist: {
    name: "Assisted",
    blurb: "The bike steers itself. Nudge it to aim.",
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

/**
 * The shape of what is stored, not of the file it is stored in.
 *
 * Bumped when a DEFAULT changes in a way that makes an old file lie about what
 * the player chose — see `sanitise`. The key keeps its own v1 because the
 * fields have not changed and a rider should not lose their HUD inset over a
 * different question.
 */
const STORAGE_VERSION = 2;

interface Stored {
  /** Which set of defaults this was written against. See STORAGE_VERSION. */
  v?: number;
  hudInset?: number;
  raceScheme?: RaceScheme;
  haptics?: boolean;
}

const DEFAULTS = {
  hudInset: 0,
  raceScheme: "tap" as RaceScheme,
  haptics: true,
};

/** The one place a stored value is allowed to be wrong. */
function sanitise(raw: Stored | null) {
  const inset = Number(raw?.hudInset);
  /*
   * A v1 `assist` is not evidence of a choice, so it is not honoured.
   *
   * The whole object is written whenever any one field changes, and `assist`
   * was the default — so a v1 file reads `assist` for the rider who picked it
   * and equally for the rider who only ever nudged the HUD inset. The two are
   * indistinguishable on disk, and of the two ways to be wrong, leaving a bike
   * steering itself for somebody who never asked is much the worse. Any other
   * scheme in a v1 file was typed by hand and is kept.
   */
  const unchosen = (raw?.v ?? 1) < 2 && raw?.raceScheme === "assist";
  const scheme = unchosen ? undefined : raw?.raceScheme;
  return {
    hudInset:
      Number.isFinite(inset) && inset >= 0 && inset <= 64
        ? Math.round(inset)
        : DEFAULTS.hudInset,
    raceScheme:
      scheme && scheme in RACE_SCHEMES ? scheme : DEFAULTS.raceScheme,
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
    save({ v: STORAGE_VERSION, hudInset, raceScheme, haptics });
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
