/**
 * The default controls, written out for pages that are not the game.
 *
 * ── Why this is a second copy ────────────────────────────────────────────
 *
 * `lib/keybinds.ts` is the authority, and it is `"use client"`: it builds a
 * zustand store at module scope because the bindings are rebindable and live
 * in the browser. A statically rendered guide page that imported it would
 * become a client boundary and ship a store to describe six keys that never
 * change on it.
 *
 * So the keys are written out here, the way `content/registry.ts` writes out
 * the slugs, and `controls.test.ts` asserts this list holds exactly the
 * default bindings with exactly the labels `FOOT_LABELS` gives them. Rebind
 * a default and forget this file and the suite fails with the two values
 * named. The list cannot drift; it can only fail to build.
 *
 * ── Touch is not the same list with different words ──────────────────────
 *
 * A phone has no keyboard and the on-screen controls are not a one-to-one
 * mapping of one — sprint is a latched button rather than a held key, and
 * there is no "recentre camera" because the camera is dragged. Writing one
 * row with "Shift / tap" in it would be wrong on both devices, which is the
 * same reason `arcade/registry.ts` splits its hints in two.
 */

export interface ControlRow {
  /** What the player is doing. Matches `FOOT_LABELS` in lib/keybinds.ts. */
  readonly action: string;
  /** The default keys, as `keyLabel` renders them. */
  readonly keys: readonly string[];
  /** What it does, where that is not obvious from the name. */
  readonly note?: string;
}

/**
 * Parkour and sandbox worlds, on a keyboard.
 *
 * The order is the order `FOOT_ACTIONS` lists them, which is the order the
 * in-game settings screen uses — a player who reads this page and then opens
 * the settings should find the same list in the same sequence.
 */
export const FOOT_CONTROLS: readonly ControlRow[] = [
  { action: "Move", keys: ["W", "A", "S", "D"], note: "Arrow keys work too." },
  { action: "Jump", keys: ["Space"] },
  {
    action: "Sprint / lock on",
    keys: ["Shift"],
    note:
      "A latch, not a hold: tap once to arm sprint and a camera lock-on " +
      "together, tap again to release both. Neither carries over into the " +
      "next world you open.",
  },
  {
    action: "Respawn",
    keys: ["R"],
    note: "Back to the last checkpoint. The clock keeps running.",
  },
  {
    action: "Restart run",
    keys: ["T"],
    note:
      "The whole course, from the beginning. Deliberately not next to R — " +
      "respawn costs a checkpoint's progress and this costs the run, and the " +
      "two should not be one finger apart on a key you press while falling.",
  },
  { action: "First person", keys: ["V"] },
  { action: "Recentre camera", keys: ["C"] },
];

/** The same, with a thumb. Not a translation of the list above — see the note. */
export const TOUCH_CONTROLS: readonly ControlRow[] = [
  { action: "Move", keys: ["Left stick"] },
  { action: "Look", keys: ["Drag anywhere"] },
  { action: "Jump", keys: ["Jump button"] },
  {
    action: "Sprint",
    keys: ["Sprint button"],
    note: "Latched, so you can steer with the same thumb once it is armed.",
  },
  { action: "Respawn", keys: ["Respawn button"] },
];

/**
 * The three a player needs before they press play.
 *
 * The guide pages carry this instead of `FOOT_CONTROLS`, and link to
 * `/controls` for the rest. The full table is about 180 words and was
 * rendering identically on twenty-seven guides whose own content is around
 * 250 — repeating a third of a page across twenty-seven of them is the shape
 * of a templated site whatever the other two thirds say. It is also simply
 * not what somebody reading about one course wants mid-page.
 *
 * Derived rather than re-listed, so it cannot disagree with the full table.
 */
export const FOOT_ESSENTIALS: readonly ControlRow[] = FOOT_CONTROLS.filter(
  (row) => row.action === "Move" || row.action === "Jump" || row.action === "Sprint / lock on"
);

/**
 * On the bike, in race mode.
 *
 * A separate list rather than the foot one with words changed, for the reason
 * at the top of this file: Space is the handbrake here and jumps on foot, and
 * a single table claiming both would be wrong in one mode or the other.
 */
export const RIDE_CONTROLS: readonly ControlRow[] = [
  { action: "Throttle", keys: ["W"], note: "Arrow up works too." },
  { action: "Reverse", keys: ["S"] },
  { action: "Steer", keys: ["A", "D"] },
  {
    action: "Brake",
    keys: ["Space"],
    note:
      "The handbrake. The same key that jumps on foot — the one control both " +
      "modes agree means “stop what you are doing”.",
  },
  {
    action: "Boost",
    keys: ["Shift"],
    note: "Spends the meter that drifting fills.",
  },
  {
    action: "Drift",
    keys: ["X"],
    note: "How the boost meter is filled, so the fast line is not the tidy one.",
  },
  { action: "Look back", keys: ["B"] },
  { action: "Change camera", keys: ["V"] },
  { action: "Recover", keys: ["R"], note: "Back onto the track where you left it." },
];
