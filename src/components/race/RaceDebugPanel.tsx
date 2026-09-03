"use client";

import { useEffect, useState } from "react";
import { raceDebug, debugEnabled, type RaceDebug } from "./race-debug";

/**
 * The telemetry readout, shown only with `?debug=1` on a race URL.
 *
 * Samples on a timer rather than subscribing to a frame loop: the numbers are
 * written every frame and nobody can read them faster than a few times a
 * second, so re-rendering at 60Hz to display them would cost more than the
 * thing being measured.
 */
export function RaceDebugPanel() {
  const [d, setD] = useState<RaceDebug>({ ...raceDebug });

  useEffect(() => {
    if (!debugEnabled) return;
    const id = setInterval(() => setD({ ...raceDebug }), 200);
    return () => clearInterval(id);
  }, []);

  if (!debugEnabled) return null;

  const n = (v: number, p = 1) => (Number.isFinite(v) ? v.toFixed(p) : "NaN");
  const flag = (v: boolean) => (v ? "YES" : "no");

  return (
    <div
      style={{
        position: "fixed",
        top: 96,
        right: 8,
        zIndex: 30,
        padding: "8px 10px",
        borderRadius: 4,
        background: "rgba(11, 16, 36, 0.88)",
        border: "1px solid rgba(163, 230, 53, 0.5)",
        color: "#a3e635",
        font: "500 11px/1.5 ui-monospace, monospace",
        pointerEvents: "none",
        minWidth: 168,
      }}
    >
      <div style={{ color: "#edf0f3", marginBottom: 4 }}>BIKE TELEMETRY</div>
      <div>armed {flag(d.armed)}</div>
      <div>want fwd {flag(d.wantForward)}</div>
      <div>got fwd {flag(d.gotForward)}</div>
      <div>rpm {n(d.rpm, 0)}</div>
      <div>gear {d.gear} × {n(d.driveRatio, 2)}</div>
      <div>torque {n(d.driveTorque, 1)}</div>
      <div>wheelspin {n(d.wheelSpin, 1)}</div>
      <div>
        grounded {d.grounded}/{d.wheels}
      </div>
      <div>speed {n(d.speed, 2)}</div>
      <div>y {n(d.y, 2)}</div>
    </div>
  );
}
