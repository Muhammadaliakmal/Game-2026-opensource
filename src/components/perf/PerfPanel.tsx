"use client";

import { useEffect, useState } from "react";
import { perfEnabled, perfStats, type PerfStats } from "./perf-stats";

/**
 * The readout. A DOM panel outside the canvas, sampling on its own timer.
 *
 * Four times a second rather than every frame: nobody can read faster than
 * that, and re-rendering a React component at 60Hz to display a frame-rate
 * measurement would change the number it is reporting.
 */
export function PerfPanel() {
  const [s, setS] = useState<PerfStats>({ ...perfStats });

  useEffect(() => {
    if (!perfEnabled) return;
    const id = setInterval(() => setS({ ...perfStats }), 250);
    return () => clearInterval(id);
  }, []);

  if (!perfEnabled) return null;

  // Against MAP.md §10: 250 draw calls desktop / 120 mobile, 1.2M / 350k
  // triangles, and §10.1's "stop at ~40 programs".
  const warn = (v: number, limit: number) =>
    v > limit ? "#e5484d" : v > limit * 0.75 ? "#ffb020" : "#a3e635";

  const row = (label: string, value: string, color?: string) => (
    <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ color: color ?? "#edf0f3" }}>{value}</span>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed",
        top: 96,
        left: 8,
        zIndex: 30,
        padding: "8px 10px",
        borderRadius: 4,
        background: "rgba(11, 16, 36, 0.88)",
        border: "1px solid rgba(163, 230, 53, 0.5)",
        font: "500 11px/1.6 ui-monospace, monospace",
        color: "#edf0f3",
        pointerEvents: "none",
        minWidth: 172,
      }}
    >
      <div style={{ marginBottom: 4, opacity: 0.7 }}>RENDER — ?perf=1</div>
      {row("fps", s.fps.toFixed(0), warn(60 - s.fps, 20))}
      {row("worst frame", `${s.worstMs.toFixed(0)}ms`, warn(s.worstMs, 33))}
      {row("draw calls", String(s.calls), warn(s.calls, 250))}
      {row("triangles", s.triangles.toLocaleString(), warn(s.triangles, 1_200_000))}
      <div style={{ height: 4 }} />
      {row("geometries", String(s.geometries))}
      {row("textures", String(s.textures))}
      {row("programs", String(s.programs), warn(s.programs, 40))}
      <div style={{ height: 4 }} />
      {row("tier", s.tier)}
      {row("dpr", s.dpr.toFixed(2))}
    </div>
  );
}
