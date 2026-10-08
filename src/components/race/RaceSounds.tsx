"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { audioBus, duckBus, noiseHit, noiseLoop, toneHit } from "@/lib/audio";
import { useRaceStore } from "@/stores/race-store";
import { raceTelemetry } from "./telemetry";
import { MAX_SPEED, engineNote } from "./engine-note";

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
 * ── The engine is a geared motor, not a siren ────────────────────────────
 *
 * Revs come from `engine-note.ts`: five gears and a boost overrev, so the
 * engine climbs, drops on the shift, and climbs again. The tone is two
 * detuned triangles and two sine harmonics — soft-edged, nothing a phone
 * speaker turns into a buzz — with the firing as an amplitude pulse at a
 * fraction of the pitch, which is where a motor's growl lives and the one
 * part of a low engine a small speaker can still carry. A high-pass at 85 Hz
 * throws away what no phone can play anyway.
 *
 * The first version was a sawtooth and a square from 26 Hz up through a
 * resonant lowpass: harsh on headphones and pure buzz on a phone.
 *
 * Load (speeding up, coasting, braking) is read off the change in speed: on
 * the throttle the engine is louder and brighter, off it the sound drops back
 * and burbles. An upshift under load cuts the note for a beat. The engine
 * idles on the grid: a silent bike under the lights is a race that has not
 * started for the ear either.
 */

const BOOST_TOP_SPEED = 26;

const ENGINE_IDLE_GAIN = 0.05;
const ENGINE_RIDE_GAIN = 0.1;
/** How long an upshift's cut lasts, seconds. */
const SHIFT_CUT = 0.07;

const DRIFT_GAIN = 0.06;

interface Live {
  ctx: AudioContext;
  /** Every engine oscillator, for start and stop. */
  oscs: OscillatorNode[];
  body: OscillatorNode;
  body2: OscillatorNode;
  octave: OscillatorNode;
  turbine: OscillatorNode;
  turbineGain: GainNode;
  pulse: OscillatorNode;
  pulseDepth: GainNode;
  engineFilter: BiquadFilterNode;
  engineGain: GainNode;
  /** Everything to disconnect on teardown. */
  nodes: AudioNode[];
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

  const osc = (type: OscillatorType, f: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    return o;
  };
  const gain = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };

  // The body: two triangles a few cents apart, so it beats like an engine
  // rather than sitting dead still like a tuning fork.
  const body = osc("triangle", 130, -6);
  const body2 = osc("triangle", 130, 7);
  const octave = osc("sine", 260);
  const turbine = osc("sine", 390);
  const mix = gain(1);
  const bodyGain = gain(0.5);
  const body2Gain = gain(0.45);
  const octaveGain = gain(0.28);
  const turbineGain = gain(0);
  body.connect(bodyGain).connect(mix);
  body2.connect(body2Gain).connect(mix);
  octave.connect(octaveGain).connect(mix);
  turbine.connect(turbineGain).connect(mix);

  // The firing pulse: the mix's level wobbles at a fraction of the pitch.
  const am = gain(0.7);
  const pulse = osc("sine", 32);
  const pulseDepth = gain(0.25);
  pulse.connect(pulseDepth).connect(am.gain);
  mix.connect(am);

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 85;
  highpass.Q.value = 0.5;
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 900;
  engineFilter.Q.value = 0.6;
  const engineGain = gain(0);
  am.connect(highpass).connect(engineFilter).connect(engineGain).connect(a.bus.game);
  const oscs = [body, body2, octave, turbine, pulse];
  for (const o of oscs) o.start();

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

  return {
    ctx,
    oscs,
    body,
    body2,
    octave,
    turbine,
    turbineGain,
    pulse,
    pulseDepth,
    engineFilter,
    engineGain,
    nodes: [mix, bodyGain, body2Gain, octaveGain, turbineGain, am, pulseDepth, highpass, engineFilter, engineGain],
    tyre,
    tyreFilter,
    tyreGain,
    hum,
    humGain,
  };
}

function teardown(l: Live) {
  const t = l.ctx.currentTime;
  // Fade before stopping: an oscillator cut mid-cycle is a click.
  for (const g of [l.engineGain, l.tyreGain, l.humGain]) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.03);
  }
  const stopAt = t + 0.2;
  for (const o of l.oscs) o.stop(stopAt);
  l.tyre.stop(stopAt);
  l.hum.stop(stopAt);
  window.setTimeout(() => {
    for (const n of [...l.oscs, ...l.nodes, l.tyre, l.tyreFilter, l.tyreGain, l.hum, l.humGain]) {
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
  toneHit(160, 0.35, 0.12, "triangle", { bus: "game", glide: 2.2 });
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
  /** The engine between frames: gear, last speed, smoothed load, shift cut. */
  const motor = useRef({ gear: -1, speed: 0, load: 0, cut: 0, at: 0 });

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
    const speed = Math.abs(T.speed);
    const ratio = Math.min(1, speed / MAX_SPEED);
    const over = Math.max(0, (speed - MAX_SPEED) / (BOOST_TOP_SPEED - MAX_SPEED));

    // Load, off the change in speed: +1 is hard on the throttle, -1 braking.
    const m = motor.current;
    const dt = m.at > 0 ? Math.min(0.1, Math.max(1e-3, t - m.at)) : 1 / 60;
    m.at = t;
    const accel = (speed - m.speed) / dt;
    m.speed = speed;
    m.load += (Math.max(-1, Math.min(1, accel / 5)) - m.load) * Math.min(1, dt * 6);
    const onThrottle = T.riding && m.load > -0.15;

    const note = engineNote(speed, m.gear);
    if (note.gear > m.gear && m.gear >= 0 && m.load > 0.1) m.cut = SHIFT_CUT;
    m.gear = note.gear;
    m.cut = Math.max(0, m.cut - dt);

    // Pitch: the gear's revs, quick enough to hear the drop on a shift.
    const f = note.hz;
    l.body.frequency.setTargetAtTime(f, t, 0.045);
    l.body2.frequency.setTargetAtTime(f, t, 0.045);
    l.octave.frequency.setTargetAtTime(f * 2, t, 0.045);
    l.turbine.frequency.setTargetAtTime(f * 3, t, 0.045);
    // Boost spins a turbine whine up over the top.
    l.turbineGain.gain.setTargetAtTime(T.boosting ? 0.16 + 0.1 * over : 0.03 * ratio, t, 0.08);

    // The firing pulse: slow and lumpy at idle and off the throttle, a fast
    // smooth growl on it.
    l.pulse.frequency.setTargetAtTime(Math.max(9, f / (onThrottle ? 3 : 5)), t, 0.06);
    l.pulseDepth.gain.setTargetAtTime(onThrottle ? 0.18 + 0.1 * (1 - note.rpm) : 0.35, t, 0.08);

    // Brightness and level: open and loud under load, closed and quieter coasting.
    const bright = 700 + 1500 * note.rpm + 900 * Math.max(0, m.load) + 700 * over;
    l.engineFilter.frequency.setTargetAtTime(onThrottle ? bright : bright * 0.6, t, 0.06);
    const level = T.riding
      ? ENGINE_IDLE_GAIN + (ENGINE_RIDE_GAIN - ENGINE_IDLE_GAIN) * (0.35 + 0.65 * ratio) * (onThrottle ? 1 : 0.7)
      : ENGINE_IDLE_GAIN;
    l.engineGain.gain.setTargetAtTime(m.cut > 0 ? level * 0.45 : level, t, m.cut > 0 ? 0.012 : 0.05);

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
