"use client";

import { useEffect, useState } from "react";
import { Joystick } from "ecctrl/input";
import { touchInput } from "./touch-input";
import { useMoveMode } from "./move-mode";

/**
 * On-screen controls for touch devices (SPEC §1 put mobile out of v1; this is
 * a deliberate addition on top).
 *
 * The thumbstick is ecctrl's own overlay — worth keeping rather than
 * hand-rolling, because it already handles pointer capture, multi-touch
 * pointer-id tracking and radius clamping. The action buttons are ours: they
 * need the Neon Voxel styling, and RUN needs latch behaviour that ecctrl's
 * momentary VirtualButton can't express.
 *
 * Everything here is `position: fixed` above the canvas, so a pointer that
 * starts on a control never reaches the canvas's drag-to-look listener. That's
 * what lets the left thumb drive while the right thumb looks.
 */

function ActionButton({
  label,
  size,
  accent,
  active,
  style,
  onPress,
  onRelease,
}: {
  label: string;
  size: number;
  accent: string;
  active: boolean;
  style: React.CSSProperties;
  onPress(): void;
  onRelease?(): void;
}) {
  const [held, setHeld] = useState(false);
  const lit = active || held;

  return (
    <button
      aria-label={label}
      aria-pressed={active}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(true);
        onPress();
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setHeld(false);
        onRelease?.();
      }}
      onPointerCancel={() => {
        setHeld(false);
        onRelease?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        zIndex: 10,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.1em",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        transition:
          "transform .1s ease, background .12s ease, box-shadow .12s ease",
        transform: held ? "scale(0.93)" : "scale(1)",
        border: `2px solid ${accent}`,
        background: lit ? accent : "rgba(33, 37, 41, 0.55)",
        color: lit ? "#1a1d21" : accent,
        boxShadow: lit ? `0 0 26px -4px ${accent}` : "none",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function TouchControls() {
  const running = useMoveMode((s) => s.running);
  // Sprint only — deliberately NOT the Shift lock-on. On a phone the whole
  // point is that the character turns to face wherever the stick is pushed;
  // pinning its facing to the camera would take that away.
  const toggleRun = useMoveMode((s) => s.toggleRun);

  // Don't leave sprint armed for the next world you open.
  useEffect(() => useMoveMode.getState().reset, []);

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
          background: "rgba(33, 37, 41, 0.55)",
          border: "1px solid rgba(74, 82, 92, 0.6)",
          backdropFilter: "blur(10px)",
        }}
        joystickKnobStyle={{
          width: 62,
          height: 62,
          background: "#edf0f3",
          boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
        }}
      />

      {/* Momentary — held, so the jump-feel layer still sees a real press and
          release edge and variable jump height keeps working. */}
      <ActionButton
        label="JUMP"
        size={82}
        accent="#ffb020"
        active={false}
        style={{ right: 20, bottom: 100 }}
        onPress={() => {
          touchInput.jump = true;
        }}
        onRelease={() => {
          touchInput.jump = false;
        }}
      />

      {/* Latching — tap to arm sprint, then just steer. Holding a run button
          while also steering and looking is a three-thumb problem. */}
      <ActionButton
        label="RUN"
        size={68}
        accent="#c3c9d0"
        active={running}
        style={{ right: 112, bottom: 26 }}
        onPress={toggleRun}
      />
    </>
  );
}
