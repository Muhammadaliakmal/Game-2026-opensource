"use client";

import { useEffect, useRef } from "react";

/**
 * The shared 20 Hz sampler every live race readout draws from.
 *
 * ── Why it is a module and not a hook inside Gauges ──────────────────────
 *
 * It started inside `Gauges.tsx`, where the speedometer and the boost tank
 * were the only two things reading `raceTelemetry`. The BOOST *button* is the
 * third, and it lives in a completely different tree — the thumb clusters are
 * `position: fixed` overlays outside the HUD grid — so the choice was either a
 * second rAF loop or one importable sampler. A second loop is not a small
 * thing: two `requestAnimationFrame` chains reading the same object at
 * slightly different phases is how a meter and the button next to it come to
 * disagree about whether there is charge left, which is the exact class of bug
 * #24 turned out to be.
 *
 * ── Why 20 Hz and not every frame ────────────────────────────────────────
 *
 * At 60 Hz the last digit of a speedometer is a blur, and a blur is not
 * information. Everything drawn from this is CSS-eased between samples, so it
 * still looks continuous while costing a third as many writes.
 *
 * ── Why nothing here goes through React state ────────────────────────────
 *
 * The values change every frame. Routing them through `useState` would
 * re-render the standings, the lap counter and the start lights sixty times a
 * second to move a bar. Subscribers write `textContent`, a transform or a
 * `dataset` field and nothing else — the same call the editor's coordinate
 * readout makes.
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

/**
 * Subscribe a draw function to the sampler.
 *
 * The loop runs only while something is subscribed: the last unsubscribe
 * cancels it, so a race that has been left behind is not still sampling
 * telemetry for a HUD nobody is looking at.
 */
export function useGauge(draw: Sink) {
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
