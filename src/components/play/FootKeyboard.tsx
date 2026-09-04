"use client";

import { KeyboardControls } from "@react-three/drei";
import { useFootControls } from "./controls";

/**
 * `<KeyboardControls>` wired to the player's own bindings.
 *
 * A component rather than a hook call in each canvas because of the remount:
 * drei reads `map` once, when it builds its store, so a rebind has to replace
 * the element. Keying it here means the three canvases that mount a character
 * cannot each forget to.
 */
export function FootKeyboard({ children }: { children: React.ReactNode }) {
  const { map, revision } = useFootControls();
  return (
    <KeyboardControls key={revision} map={map}>
      {children}
    </KeyboardControls>
  );
}
