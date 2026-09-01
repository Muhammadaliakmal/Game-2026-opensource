import { create } from "zustand";

/**
 * Touch button state.
 *
 * Jump is momentary and read every frame by the jump-feel layer, so it lives
 * in a plain module object — nothing should re-render 60 times a second for it.
 * Run is a latch the player toggles occasionally *and* the button renders from,
 * so that one is real store state.
 */

/** Momentary — true only while the JUMP button is held. */
export const touchInput = { jump: false };

interface RunState {
  /** Sticky sprint: tap once to arm, tap again to disarm. */
  running: boolean;
  toggle(): void;
  reset(): void;
}

export const useRunStore = create<RunState>((set) => ({
  running: false,
  toggle: () => set((s) => ({ running: !s.running })),
  reset: () => set({ running: false }),
}));
