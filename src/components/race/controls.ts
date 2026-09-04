"use client";

import { useMemo } from "react";
import type { KeyboardControlsEntry } from "@react-three/drei";
import { HELD_RIDE, useKeybinds, type Binds } from "@/lib/keybinds";

/**
 * The riding keys.
 *
 * Separate from the on-foot map (components/play/controls.ts) because a
 * vehicle wants different verbs: there is no strafing on a bike, and the
 * left/right keys turn a front wheel rather than sliding a body sideways.
 *
 * The set grew in 6b. Throttle, reverse, steering and brake were the whole of
 * it; boost, drift and look-back are the three that turn riding from "holding
 * forward" into something with a decision in every corner. Camera cycle and
 * recover are edge actions and are handled in `Bike` off `KeyboardEvent.code`
 * rather than polled — see `lib/keybinds.ts` on held versus edge.
 */
export type RaceControl = (typeof HELD_RIDE)[number];

/** Pure — the same layout always produces the same map. */
export function raceKeyboardMapFor(
  binds: Binds
): KeyboardControlsEntry<RaceControl>[] {
  return HELD_RIDE.map((name) => ({ name, keys: [...binds.ride[name]] }));
}

/** The live map and its remount key — see `useFootControls` for why. */
export function useRideControls() {
  const binds = useKeybinds((s) => s.binds);
  const revision = useKeybinds((s) => s.revision);
  const map = useMemo(() => raceKeyboardMapFor(binds), [binds]);
  return { map, revision };
}
