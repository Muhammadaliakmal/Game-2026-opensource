"use client";

import { KeyboardControls } from "@react-three/drei";
import { useRideControls } from "./controls";

/** `<KeyboardControls>` wired to the rider's own bindings. See FootKeyboard. */
export function RideKeyboard({ children }: { children: React.ReactNode }) {
  const { map, revision } = useRideControls();
  return (
    <KeyboardControls key={revision} map={map}>
      {children}
    </KeyboardControls>
  );
}
