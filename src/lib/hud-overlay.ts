"use client";

import { create } from "zustand";

/**
 * What is currently covering the screen.
 *
 * ── Why this is a store and not a prop ───────────────────────────────────
 *
 * The Settings dialog and the Play menu each used to own their open/closed
 * flag locally, which was right while nothing else needed to know. It stopped
 * being right the moment the touch controls had to disappear behind them: the
 * controls are `position: fixed` clusters rendered as siblings of the HUD, not
 * descendants of either the gear or the menu, so there is no prop to thread —
 * the flag has to live somewhere both can see. Threading it through PlayHud,
 * RaceHud and the arena HUD instead would mean three copies of the same
 * plumbing and three chances to forget one.
 *
 * ── Why the controls have to go at all ───────────────────────────────────
 *
 * A JUMP button on top of a settings panel is not decoration, it is a live
 * control: `TouchButton` is fixed-position with `pointer-events: auto`, so a
 * thumb reaching for a menu row that happens to sit under it presses JUMP
 * instead and the character jumps off a ledge while its owner is reading. The
 * same is true of the joystick. An overlay that owns the screen has to own all
 * of it.
 *
 * `blocked` is stored rather than derived on read so that a component can
 * subscribe to the one boolean it cares about and not re-render when an
 * unrelated flag moves.
 */
interface HudOverlay {
  /** The Settings modal. */
  settings: boolean;
  /** The in-game menu. */
  menu: boolean;
  /**
   * The control-layout editor. Deliberately does NOT set `blocked` — moving a
   * button around is the one overlay that needs the controls on screen, since
   * they are the thing being edited.
   */
  laying: boolean;

  /** True while something modal owns the screen and the controls must hide. */
  blocked: boolean;

  setSettings(open: boolean): void;
  setMenu(open: boolean): void;
  setLaying(on: boolean): void;
  /** Close everything — used when leaving a world, so nothing leaks into the next. */
  reset(): void;
}

export const useHudOverlay = create<HudOverlay>((set, get) => {
  /** One place that decides what "blocked" means, so the two setters cannot disagree. */
  const recompute = () => {
    const { settings, menu } = get();
    set({ blocked: settings || menu });
  };

  return {
    settings: false,
    menu: false,
    laying: false,
    blocked: false,

    setSettings: (settings) => {
      set({ settings });
      recompute();
    },
    setMenu: (menu) => {
      set({ menu });
      recompute();
    },
    setLaying: (laying) => set({ laying }),
    reset: () =>
      set({ settings: false, menu: false, laying: false, blocked: false }),
  };
});
