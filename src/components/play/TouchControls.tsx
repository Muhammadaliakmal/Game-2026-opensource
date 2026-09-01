"use client";

import { useEffect, useState } from "react";
import { Joystick, VirtualButton } from "ecctrl/input";

/**
 * On-screen controls for touch devices (SPEC §1 put mobile out of v1; this is
 * a deliberate addition on top).
 *
 * These are ecctrl's own DOM overlays — worth using rather than hand-rolling,
 * because they already handle pointer capture, multi-touch pointer-id tracking
 * and radius clamping. They only write to ecctrl's input stores; Player is what
 * bridges those stores into `setMovement`, exactly as it does for the keyboard.
 */

/** True on touch/pen devices, or any viewport small enough to want thumb controls. */
export function useTouchControls() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const sync = () => setOn(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return on;
}

export function TouchControls() {
  return (
    <>
      <Joystick
        joystickMaxRadius={44}
        joystickWrapperStyle={{
          left: 12,
          bottom: 12,
          width: 168,
          height: 168,
        }}
        joystickBaseStyle={{
          width: 116,
          height: 116,
          background: "rgba(255,255,255,0.06)",
          border: "2px solid rgba(255,255,255,0.18)",
        }}
        joystickKnobStyle={{
          width: 62,
          height: 62,
          background: "rgba(255,255,255,0.85)",
        }}
      />

      <VirtualButton
        id="jump"
        label="JUMP"
        buttonWrapperStyle={{
          right: 20,
          bottom: 96,
          width: 78,
          height: 78,
          background: "rgba(255,255,255,0.06)",
        }}
        buttonCapStyle={{
          width: 62,
          height: 62,
          background: "rgba(16,185,129,0.9)",
          color: "white",
        }}
      />

      <VirtualButton
        id="run"
        label="RUN"
        buttonWrapperStyle={{
          right: 108,
          bottom: 24,
          width: 66,
          height: 66,
          background: "rgba(255,255,255,0.06)",
        }}
        buttonCapStyle={{
          width: 52,
          height: 52,
          background: "rgba(59,130,246,0.9)",
          color: "white",
        }}
      />
    </>
  );
}
