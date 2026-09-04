"use client";

import { useMemo } from "react";
import type { KeyboardControlsEntry } from "@react-three/drei";
import { HELD_FOOT, useKeybinds, type Binds } from "@/lib/keybinds";

/**
 * The movement keys, shared by every mode that has a player in it.
 *
 * drei only captures keys into a store — ecctrl v2 reads nothing on its own,
 * so Player forwards every field of this map into setMovement each frame.
 *
 * The keys themselves are no longer written here: they come from
 * `lib/keybinds.ts`, which is rebindable and persisted. This file is now only
 * the shape drei wants, plus the hook that keeps it current.
 */
export type Control = (typeof HELD_FOOT)[number];

/** Pure — the same layout always produces the same map. */
export function keyboardMapFor(binds: Binds): KeyboardControlsEntry<Control>[] {
  return HELD_FOOT.map((name) => ({ name, keys: [...binds.foot[name]] }));
}

/**
 * The live map, plus a key to hang a remount on.
 *
 * drei's `<KeyboardControls>` reads `map` when it builds its store and does not
 * rebuild it when the prop changes, so a rebind mid-session would apply to the
 * settings panel and nowhere else. Re-keying the element on `revision` remounts
 * it, which is a whole two DOM listeners being replaced — cheap, and it happens
 * only when someone actually changes a binding.
 */
export function useFootControls() {
  const binds = useKeybinds((s) => s.binds);
  const revision = useKeybinds((s) => s.revision);
  const map = useMemo(() => keyboardMapFor(binds), [binds]);
  return { map, revision };
}
