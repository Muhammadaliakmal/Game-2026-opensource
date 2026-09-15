"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audioBus, duckBus, noiseHit, noiseLoop, toneHit } from "@/lib/audio";
import { useRaceStore } from "@/stores/race-store";
import { raceTelemetry } from "./telemetry";

/**
 * What the bike sounds like, and what the race sounds like around it.
 *
 * ── Two kinds of sound, two clocks ───────────────────────────────────────
 *
 * The engine, the tyres and the boost hum are *continuous*: they are always
 * playing and the frame loop only moves their parameters, the way it moves
 * the speedometer. Nothing is created per frame — three oscillators and one
 * noise loop are built on the first frame the graph exists and stopped on
 * unmount. Everything else — the lap bell, the lights, a crash, the podium —
 * is an *event*, and events come from two places: the store, for anything the
 * server decides (laps, places, the phase), and `raceTelemetry`, for what the
 * simulation decides on this machine (a crash, a boost lighting).
 *
 * ── The engine is a pitch, not a sample ──────────────────────────────────
 *
 * A sawtooth and a square an octave under it, through a lowpass that opens
 * with speed. Pitch follows speed on a short time constant, so lifting off
 * the throttle is heard as a fall rather than a cut, and a boost — which
 * raises the top speed — is heard as the engine going somewhere it could not
 * go before, without any special case. The engine idles on the grid: a race
 * with a silent bike under the lights is a race that has not started for the
 * ear either.
 */

/** Speeds the sounds are scaled against. Mirrors the bike's constants. */
const MAX_SPEED = 18;
const BOOST_TOP_SPEED = 26;

const ENGINE_IDLE_HZ = 52;
const ENGINE_SPAN_HZ = 150;
const ENGINE_IDLE_GAIN = 0.035;
const ENGINE_RIDE_GAIN = 0.075;

const DRIFT_GAIN = 0.1;

interface Live {
  ctx: AudioContext;
  saw: OscillatorNode;
  sub: OscillatorNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  tyre: AudioBufferSourceNode;
  tyreFilter: BiquadFilterNode;
  tyreGain: GainNode;
  hum: OscillatorNode;
  humGain: GainNode;
}

function build(): Live | null {
  const a = audioBus();
  if (!a || a.ctx.state !== "running") return null;
  const { ctx } = a;

  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.value = ENGINE_IDLE_HZ;
  const sub = ctx.createOscillator();
  sub.type = "square";
  sub.frequency.value = ENGINE_IDLE_HZ / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.4;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 300;
  engineFilter.Q.value = 2;
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  saw.connect(engineFilter);
  sub.connect(subGain).connect(engineFilter);
  engineFilter.connect(engineGain).connect(a.bus.game);
  saw.start();
  sub.start();

  const tyre = noiseLoop();
  if (!tyre) return null;
  const tyreFilter = ctx.createBiquadFilter();
  tyreFilter.type = "bandpass";
  tyreFilter.frequency.value = 1800;
  tyreFilter.Q.value = 1.4;
  const tyreGain = ctx.createGain();
  tyreGain.gain.value = 0;
  tyre.connect(tyreFilter).connect(tyreGain).connect(a.bus.game);
  tyre.start();

  const hum = ctx.createOscillator();
  hum.type = "sine";
  hum.frequency.value = 220;
  const humGain = ctx.createGain();
  humGain.gain.value = 0;
  hum.connect(humGain).connect(a.bus.game);
  hum.start();

  return { ctx, saw, sub, engineFilter, engineGain, tyre, tyreFilter, tyreGain, hum, humGain };
}

function teardown(l: Live) {
  const t = l.ctx.currentTime;
  // Fade before stopping: an oscillator cut mid-cycle is a click.
  for (const g of [l.engineGain, l.tyreGain, l.humGain]) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.03);
  }
  const stopAt = t + 0.2;
  l.saw.stop(stopAt);
  l.sub.stop(stopAt);
  l.tyre.stop(stopAt);
  l.hum.stop(stopAt);
  window.setTimeout(() => {
    for (const n of [l.saw, l.sub, l.engineFilter, l.engineGain, l.tyre, l.tyreFilter, l.tyreGain, l.hum, l.humGain]) {
      n.disconnect();
    }
  }, 400);
}

/** A4-relative pitch, for the bells. */
const hz = (semitones: number) => 440 * Math.pow(2, semitones / 12);

function bell(semitones: number, at: number, gain: number, dur = 0.35) {
  toneHit(hz(semitones), dur, gain, "sine", { bus: "game", at, glide: 1 });
  toneHit(hz(semitones + 12), dur * 0.5, gain * 0.25, "triangle", { bus: "game", at, glide: 1 });
}

/** One light. The last one is the same beep a fifth up, held: GO. */
function sfxLight(go: boolean) {
  if (go) {
    toneHit(hz(7), 0.45, 0.14, "square", { bus: "game", glide: 1 });
    toneHit(hz(19), 0.45, 0.05, "square", { bus: "game", glide: 1 });
  } else {
    toneHit(hz(0), 0.12, 0.12, "square", { bus: "game", glide: 1 });
  }
}

/** Lap complete. The final lap gets a second, higher strike. */
function sfxLap(finalLap: boolean) {
  bell(3, 0, 0.12);
  bell(10, 0.08, 0.1);
  if (finalLap) {
    bell(15, 0.18, 0.11, 0.5);
    bell(22, 0.18, 0.06, 0.5);
  }
}

/** The flag. First gets the full fanfare; the podium a shorter one; the rest a chord. */
function sfxFinish(place: number) {
  if (place === 1) {
    [0, 4, 7, 12, 16].forEach((n, i) => bell(n, i * 0.09, 0.12, 0.5));
    bell(19, 0.5, 0.13, 0.9);
    noiseHit(0.6, 5000, 0.04, { bus: "game", at: 0.5 });
  } else if (place <= 3) {
    [0, 4, 7].forEach((n, i) => bell(n, i * 0.1, 0.11, 0.45));
    bell(12, 0.32, 0.12, 0.7);
  } else {
    bell(0, 0, 0.1, 0.6);
    bell(7, 0, 0.07, 0.6);
  }
}

function sfxBoost() {
  noiseHit(0.22, 3200, 0.16, { bus: "game" });
  noiseHit(0.3, 900, 0.12, { bus: "game", at: 0.05 });
  toneHit(160, 0.35, 0.1, "sawtooth", { bus: "game", glide: 2.2 });
}

function sfxCrash(loss: number) {
  const k = Math.min(1, loss / BOOST_TOP_SPEED);
  duckBus("game", 0.4, 0.08, 0.3);
  noiseHit(0.14 + k * 0.2, 240 + k * 500, 0.3 + k * 0.5, { bus: "impact", voice: "crash", maxVoices: 2 });
  toneHit(70, 0.2 + k * 0.15, 0.2 + k * 0.2, "sine", { bus: "impact", glide: 0.5 });
}

export function RaceSounds() {
  const live = useRef<Live | null>(null);
  const wasBoosting = useRef(false);
  const impacts = useRef(0);

  useEffect(() => {
    const l = live;
    return () => {
      if (l.current) teardown(l.current);
      l.current = null;
    };
  }, []);

  // Events the server decides. One subscription, comparing against what the
  // store held a moment ago, which is the shape zustand hands us for free.
  useEffect(() => {
    let lastLight = -1;
    return useRaceStore.subscribe((s, prev) => {
      if (s.phase === "countdown") {
        const light = Math.ceil(s.countdownMs / 1000);
        if (light !== lastLight && light > 0) {
          lastLight = light;
          sfxLight(false);
        }
      } else {
        lastLight = -1;
      }
      if (s.phase === "racing" && prev.phase === "countdown") sfxLight(true);

      const me = s.riders.find((r) => r.id === s.selfId);
      const was = prev.riders.find((r) => r.id === prev.selfId);
      if (!me || !was) return;
      // Lap 0→1 is leaving the grid, not a lap; the bell is for every crossing
      // after it. Rung once per lap gained even if a sync skipped one.
      if (me.lap > was.lap && was.lap >= 1) sfxLap(me.lap === s.laps);
      if (me.place > 0 && was.place === 0) sfxFinish(me.place);
    });
  }, []);

  useFrame(() => {
    if (!live.current) {
      live.current = build();
      if (!live.current) return;
    }
    const l = live.current;
    const t = l.ctx.currentTime;
    const T = raceTelemetry;
    const ratio = Math.min(1, Math.abs(T.speed) / MAX_SPEED);
    const over = Math.max(0, (Math.abs(T.speed) - MAX_SPEED) / (BOOST_TOP_SPEED - MAX_SPEED));

    // Engine: pitch and brightness follow speed; the sub follows the pitch.
    const f = ENGINE_IDLE_HZ + ENGINE_SPAN_HZ * ratio + 90 * over;
    l.saw.frequency.setTargetAtTime(f, t, 0.06);
    l.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    l.engineFilter.frequency.setTargetAtTime(300 + 1400 * ratio + 900 * over, t, 0.08);
    const gain = T.riding ? ENGINE_IDLE_GAIN + (ENGINE_RIDE_GAIN - ENGINE_IDLE_GAIN) * (0.3 + 0.7 * ratio) : ENGINE_IDLE_GAIN;
    l.engineGain.gain.setTargetAtTime(gain, t, 0.05);

    // Tyres: only while sliding, louder and brighter the faster the slide.
    l.tyreGain.gain.setTargetAtTime(T.drifting ? DRIFT_GAIN * (0.4 + 0.6 * ratio) : 0, t, T.drifting ? 0.08 : 0.04);
    l.tyreFilter.frequency.setTargetAtTime(1400 + 1200 * ratio, t, 0.1);

    // Boost hum: rises with the charge this drift is earning, and goes quiet
    // the moment the drift ends and the charge is banked.
    l.hum.frequency.setTargetAtTime(200 + 500 * T.charge, t, 0.05);
    l.humGain.gain.setTargetAtTime(T.drifting && T.charge > 0.02 ? 0.03 + 0.03 * T.charge : 0, t, 0.06);

    // Events the simulation decides.
    if (T.boosting && !wasBoosting.current) sfxBoost();
    wasBoosting.current = T.boosting;
    if (T.impacts !== impacts.current) {
      impacts.current = T.impacts;
      if (T.impacts > 0) sfxCrash(T.impactLoss);
    }
  });

  return null;
}
