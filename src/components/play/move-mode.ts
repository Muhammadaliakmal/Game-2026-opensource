import { create } from "zustand";

/**
 * How the character relates to the camera while moving.
 *
 * Two independent latches, because desktop and touch want different things
 * out of the same "go faster" gesture:
 *
 * - `running` is sprint. The touch RUN button sets only this, so on a phone
 *   the character keeps turning to face wherever the thumbstick is pushing.
 * - `lockedOn` additionally pins the character's facing to the camera's
 *   forward direction (ecctrl's `setLockForward`). Aim with the mouse, tap
 *   Shift, and the body holds that heading while you strafe around it.
 *
 * Shift drives them together — tap once to lock on *and* sprint, tap again to
 * release both — which is what makes it a single-key mode switch rather than
 * two things to remember.
 *
 * Real store state rather than a module object: unlike look yaw these change a
 * few times a minute, and the HUD renders an indicator from them.
 */
interface MoveMode {
  /** Sprint. Set by the touch RUN button and by the Shift lock. */
  running: boolean;
  /** Face the camera instead of the direction of travel. */
  lockedOn: boolean;
  /** Touch RUN: sprint only, so facing still follows the stick. */
  toggleRun(): void;
  /** Shift: lock-on and sprint as one mode. */
  toggleLockOn(): void;
  reset(): void;
}

export const useMoveMode = create<MoveMode>((set) => ({
  running: false,
  lockedOn: false,
  toggleRun: () => set((s) => ({ running: !s.running })),
  toggleLockOn: () =>
    set((s) =>
      s.lockedOn
        ? { lockedOn: false, running: false }
        : { lockedOn: true, running: true }
    ),
  reset: () => set({ running: false, lockedOn: false }),
}));
