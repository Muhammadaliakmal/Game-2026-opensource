"use client";

import { useRef } from "react";
import {
  BOOST_MIN_TO_FIRE,
  KPH_PER_UNIT,
  boostArmed,
  raceTelemetry,
} from "./telemetry";
import { useGauge } from "./use-gauge";

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
 * The loop itself lives in `use-gauge.ts` rather than here, because the BOOST
 * button reads the same telemetry from a completely different tree — see that
 * file for why one sampler and not two.
 */

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
      // Armed is a separate axis from what the tank is *doing*, because the
      // two answer different questions: `state` is "is something happening",
      // `armed` is "could it". They were conflated, which is how a meter at
      // zero and a meter at full came to look nearly the same.
      wrap.current.dataset.armed = boostArmed() ? "1" : "0";
    }
  });

  return (
    <div
      ref={wrap}
      data-state="idle"
      data-armed="0"
      className="hud-panel hud-panel--readout group flex flex-col gap-1 px-3 py-2 data-[state=spending]:shadow-[var(--glow-strong)]"
    >
      <div className="flex items-center gap-2">
        <span className="hud-label">Boost</span>
        {/* The one word that says what fills it. It appears only while the
            answer is being demonstrated, which is when it will be read. */}
        <span className="hud-label text-accent opacity-0 transition-opacity group-data-[state=charging]:opacity-100">
          drift
        </span>
        {/* And the one word that says it is gone. Same slot, mutually
            exclusive with the above — you cannot be charging and empty. */}
        <span className="hud-label text-dim ml-auto opacity-0 transition-opacity group-data-[armed=0]:opacity-100">
          empty
        </span>
      </div>
      {/* The track is a real, visible empty state rather than a hairline.
          `bg-edge/50` over a bright section of Vapor Ridge is grey on grey,
          which made the difference between a full tank and an empty one
          almost invisible — and boost is the mechanic the mode is sold on.
          Subtlety belongs on the container, not on the data. */}
      <div className="border-edge relative h-2 w-24 overflow-hidden rounded-full border bg-black/55 sm:w-28">
        <div
          ref={charge}
          className="bg-accent/35 absolute inset-0 h-full w-full origin-left transition-transform duration-100 ease-linear"
          style={{ transform: "scaleX(0)" }}
        />
        <div
          ref={tank}
          className="bg-accent absolute inset-0 h-full w-full origin-left transition-transform duration-100 ease-linear group-data-[armed=0]:bg-white/25"
          style={{ transform: "scaleX(0)" }}
        />
        {/* The fire threshold, drawn where it actually is.

            Without it the floor is an invisible rule: a rider with a sliver in
            the tank presses BOOST, nothing happens, and the only available
            explanation is that boost is broken. A tick at the same fraction
            the gate uses turns that into "not enough yet", which is a rule
            rather than a fault. */}
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-white/45"
          style={{ left: `${BOOST_MIN_TO_FIRE * 100}%` }}
        />
      </div>
    </div>
  );
}
