"use client";

import { useEffect, useState } from "react";
import { Joystick } from "ecctrl/input";
import { raceTouch } from "./race-touch";

/**
 * Thumb controls for riding.
 *
 * The stick steers only — its Y is ignored, because a bike does not go
 * sideways and pushing a stick "up" to accelerate while also pushing it left to
 * turn is one thumb doing two jobs badly. Throttle and brake are their own
 * targets on the right, where they can be held.
 *
 * Everything is `position: fixed` above the canvas, so a pointer that starts on
 * a control never reaches the world.
 */

function HoldButton({
  label,
  size,
  accent,
  style,
  onDown,
  onUp,
}: {
  label: string;
  size: number;
  accent: string;
  style: React.CSSProperties;
  onDown(): void;
  onUp(): void;
}) {
  const [held, setHeld] = useState(false);

  // A pointer lost to a cancel — a call arriving, the app backgrounding — must
  // release the control. A throttle stuck on because the phone rang is the
  // worst bug this file could have.
  useEffect(() => () => onUp(), [onUp]);

  return (
    <button
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(true);
        onDown();
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        setHeld(false);
        onUp();
      }}
      onPointerCancel={() => {
        setHeld(false);
        onUp();
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
        transition: "transform .1s ease, background .12s ease, box-shadow .12s ease",
        transform: held ? "scale(0.93)" : "scale(1)",
        border: `2px solid ${accent}`,
        background: held ? accent : "rgba(33, 37, 41, 0.55)",
        color: held ? "#1a1d21" : accent,
        boxShadow: held ? `0 0 26px -4px ${accent}` : "none",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

export function RaceTouchControls() {
  // Never leave a control held for the next race.
  useEffect(
    () => () => {
      raceTouch.throttle = false;
      raceTouch.brake = false;
      raceTouch.reverse = false;
    },
    []
  );

  return (
    <>
      <Joystick
        joystickMaxRadius={46}
        joystickWrapperStyle={{ left: 12, bottom: 12, width: 168, height: 168 }}
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

      <HoldButton
        label="GO"
        size={88}
        accent="#a3e635"
        style={{ right: 20, bottom: 104 }}
        onDown={() => {
          raceTouch.throttle = true;
        }}
        onUp={() => {
          raceTouch.throttle = false;
        }}
      />
      <HoldButton
        label="BRAKE"
        size={70}
        accent="#ffb020"
        style={{ right: 116, bottom: 30 }}
        onDown={() => {
          raceTouch.brake = true;
        }}
        onUp={() => {
          raceTouch.brake = false;
        }}
      />
      <HoldButton
        label="BACK"
        size={58}
        accent="#c3c9d0"
        style={{ right: 24, bottom: 30 }}
        onDown={() => {
          raceTouch.reverse = true;
        }}
        onUp={() => {
          raceTouch.reverse = false;
        }}
      />
    </>
  );
}
