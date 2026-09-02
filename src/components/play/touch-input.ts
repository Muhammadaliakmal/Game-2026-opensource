/**
 * Touch button state.
 *
 * Jump is momentary and read every frame by the jump-feel layer, so it lives
 * in a plain module object — nothing should re-render 60 times a second for it.
 *
 * Sprint used to live here too. It moved to `move-mode.ts` once Shift started
 * driving the same latch: it is no longer touch-specific state.
 */

/** Momentary — true only while the JUMP button is held. */
export const touchInput = { jump: false };
