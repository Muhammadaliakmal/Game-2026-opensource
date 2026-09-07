"use client";

import { useEffect, useRef } from "react";
import { KPH_PER_UNIT, raceTelemetry } from "./telemetry";

/**
 * Speed and boost, drawn straight into the DOM.
 *
 * ── Why these two and nothing else ───────────────────────────────────────
 *
 * Speed and race position are the two things no racing game omits. Position
 * was already on screen; speed was not, which meant the one number that tells
 * a rider whether the last corner cost them anything was missing.
 *
 * ── Why it does not go through React ─────────────────────────────────────
 *
 * Both values change every frame. Routing them through state would re-render
 * the standings, the lap counter and the start lights sixty times a second to
 * move a bar. So a single rAF loop samples the telemetry object and writes
 * `textContent` and one transform per gauge, exactly like the editor's
 * coordinate readout.
 *
 * It samples at 20 Hz rather than every frame on purpose: at 60 Hz the last
 * digit of a speedometer is a blur, and a blur is not information. The bar is
 * drawn at the same rate and CSS-eased between samples, so it still looks
 * continuous while costing a third as many writes.
 */

const SAMPLE_MS = 50;

type Sink = () => void;
const sinks = new Set<Sink>();
let raf = 0;
let last = 0;

function pump(now: number) {
  raf = requestAnimationFrame(pump);
  if (now - last < SAMPLE_MS) return;
  last = now;
  for (const s of sinks) s();
}

/** Subscribe a draw function to the shared 20 Hz sampler. */
function useGauge(draw: Sink) {
  const ref = useRef(draw);
  // Updated after each render rather than during one: the subscription below
  // must not be torn down and rebuilt every time the component re-renders for
  // an unrelated reason, so the sampler holds a stable indirection instead of
  // the callback itself.
  useEffect(() => {
    ref.current = draw;
  });

  useEffect(() => {
    const sink = () => ref.current();
    sinks.add(sink);
    if (raf === 0) raf = requestAnimationFrame(pump);
    return () => {
      sinks.delete(sink);
      if (sinks.size === 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }, []);
}

/**
 * The speedometer.
 *
 * Bottom-right, which is where every racing game puts it and therefore where a
 * player's eye already goes. The bar underneath is the same value again as a
 * shape, because a number read with 20% of your attention is a shape first.
 */
export function Speedometer() {
  const value = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  useGauge(() => {
    const kph = Math.round(Math.abs(raceTelemetry.speed) * KPH_PER_UNIT);
    if (value.current) value.current.textContent = String(kph);
    if (bar.current) {
      const frac = Math.min(
        1,
        Math.abs(raceTelemetry.speed) / Math.max(1, raceTelemetry.topSpeed)
      );
      bar.current.style.transform = `scaleX(${frac.toFixed(3)})`;
      // Over the normal limit the bar changes colour rather than growing past
      // its own end — the shape stays honest and the state is still visible.
      bar.current.dataset.over = raceTelemetry.boosting ? "1" : "0";
    }
  });

  return (
    <div className="hud-panel hud-panel--readout flex flex-col items-end gap-1 px-3 py-2">
      <div className="flex items-baseline gap-1.5">
        <span ref={value} className="hud-readout text-2xl">
          0
        </span>
        <span className="hud-label">kph</span>
      </div>
      <div className="bg-edge/50 h-1 w-24 overflow-hidden rounded-full sm:w-28">
        <div
          ref={bar}
          data-over="0"
          className="bg-accent h-full w-full origin-left transition-transform duration-100 ease-linear data-[over=1]:bg-white"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}

/**
 * The boost tank.
 *
 * Bottom-left, opposite the speedometer, because it is the gauge you check
 * *before* a straight rather than during one. The unbanked drift charge rides
 * on top of the banked tank as a second, dimmer bar: while you are sliding you
 * can see what the slide is worth, which is the feedback that teaches the
 * mechanic without a tutorial saying so.
 */
export function BoostMeter() {
  const tank = useRef<HTMLDivElement>(null);
  const charge = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useGauge(() => {
    if (tank.current) {
      tank.current.style.transform = `scaleX(${raceTelemetry.boost.toFixed(3)})`;
    }
    if (charge.current) {
      const total = Math.min(1, raceTelemetry.boost + raceTelemetry.charge);
      charge.current.style.transform = `scaleX(${total.toFixed(3)})`;
    }
    if (wrap.current) {
      wrap.current.dataset.state = raceTelemetry.boosting
        ? "spending"
        : raceTelemetry.drifting
          ? "charging"
          : "idle";
    }
  });

  return (
    <div
      ref={wrap}
      data-state="idle"
      className="hud-panel hud-panel--readout group flex flex-col gap-1 px-3 py-2 data-[state=spending]:shadow-[var(--glow-strong)]"
    >
      <div className="flex items-center gap-2">
        <span className="hud-label">Boost</span>
        {/* The one word that says what fills it. It appears only while the
            answer is being demonstrated, which is when it will be read. */}
        <span className="hud-label text-accent opacity-0 transition-opacity group-data-[state=charging]:opacity-100">
          drift
        </span>
      </div>
      <div className="bg-edge/50 relative h-1.5 w-24 overflow-hidden rounded-full sm:w-28">
        <div
          ref={charge}
          className="bg-accent/35 absolute inset-0 h-full w-full origin-left transition-transform duration-100 ease-linear"
          style={{ transform: "scaleX(0)" }}
        />
        <div
          ref={tank}
          className="bg-accent absolute inset-0 h-full w-full origin-left transition-transform duration-100 ease-linear"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
