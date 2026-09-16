import { audioBus, noiseLoop, toneHit } from "@/lib/audio";
import { BUILT_IN_WORLDS } from "@/lib/built-in-worlds";

/**
 * The ambient bed under a world: what the place sounds like when nothing is
 * happening. Synthesised, like the arcade's track and every effect, and for
 * the same reason — a looped file is a licence, a decode and a request that
 * can fail on the one screen where silence looks like a bug.
 *
 * ── Three moods, not one per world ───────────────────────────────────────
 *
 * `natural` is wind through a lowpass with a slow swell, and birds — a few
 * short glides a couple of octaves up, on a random clock, panned wherever.
 * `cozy` is the same wind, lower and quieter, under a warm two-note drone,
 * and no birds: the cottage is indoors in spirit. `neon` is a detuned pad on
 * a minor chord, its filter breathing on a long LFO, moving to the VI every
 * so often so it is not one chord forever.
 *
 * A world picks a mood the way it picks its surfaces: the shipped ones are
 * named here, a course somebody built is a course, and everything else is
 * outdoors. Same shape as `surface-dressing.ts` and for the same reason — the
 * choice is per world, and three is the number of choices worth making.
 *
 * ── Intensity ────────────────────────────────────────────────────────────
 *
 * The bed has one knob, 0..1, that the game sets while a run is live: the
 * filter opens, the wind lifts, and a low pulse comes in under it. That is
 * the spec's "dynamic layer" at the size this game can afford — one number,
 * and the tension audibly builds the moment the clock starts and drops the
 * moment it stops.
 *
 * ── Scheduling ───────────────────────────────────────────────────────────
 *
 * Every continuous node is built once and moved with `setTargetAtTime`. The
 * only timers are the bird clock and the chord clock, and both only decide
 * *what* to play; the audio clock decides when. A hidden tab suspends the
 * context (`lib/audio.ts`), which stops all of this without any code here.
 */

export type Mood = "natural" | "cozy" | "neon";

/** The mood a world plays under. */
export function moodFor(worldId: string): Mood {
  if (worldId === "cottage") return "cozy";
  if (worldId === "island") return "natural";
  const shipped = BUILT_IN_WORLDS.find((w) => w.slug === worldId);
  if (shipped && (shipped.tier || worldId === "circuit" || worldId === "ridge")) return "neon";
  return "natural";
}

/** Bed level under the effects. */
const MIX = 0.5;

interface Bed {
  ctx: AudioContext;
  mood: Mood;
  out: GainNode;
  nodes: AudioNode[];
  sources: Array<OscillatorNode | AudioBufferSourceNode>;
  timers: number[];
  /** Things the intensity knob moves. */
  filter: BiquadFilterNode | null;
  filterBase: number;
  filterOpen: number;
  windGain: GainNode | null;
  windBase: number;
  pulseGain: GainNode;
  duck: GainNode;
}

let live: Bed | null = null;
let wantIntensity = 0;
let wantDuck = 1;

const hz = (semitones: number) => 440 * Math.pow(2, semitones / 12);

/** An LFO wired into an AudioParam: `depth` around whatever the param holds. */
function lfo(ctx: AudioContext, rate: number, depth: number, target: AudioParam, bed: Bed) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  osc.connect(g).connect(target);
  osc.start();
  bed.sources.push(osc);
  bed.nodes.push(g);
}

function wind(bed: Bed, cutoff: number, gain: number, swell: number) {
  const { ctx } = bed;
  const src = noiseLoop();
  if (!src) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(bed.duck);
  src.start();
  lfo(ctx, 0.07, cutoff * 0.45, filter.frequency, bed);
  lfo(ctx, 0.05, gain * swell, g.gain, bed);
  bed.sources.push(src);
  bed.nodes.push(filter, g);
  bed.filter = filter;
  bed.filterBase = cutoff;
  bed.filterOpen = cutoff * 2.2;
  bed.windGain = g;
  bed.windBase = gain;
}

/** A bird: two to four short upward glides, high, quiet, somewhere. */
function chirp() {
  const notes = 2 + Math.floor(Math.random() * 3);
  const base = 2600 + Math.random() * 1400;
  const pan = Math.random() * 1.6 - 0.8;
  for (let i = 0; i < notes; i++) {
    toneHit(base * (1 + Math.random() * 0.15), 0.07, 0.022, "sine", {
      bus: "music",
      at: i * 0.11,
      glide: 1.25,
      pan,
    });
  }
}

function birds(bed: Bed) {
  const next = () => {
    const wait = 2500 + Math.random() * 6000;
    const t = window.setTimeout(() => {
      if (live !== bed) return;
      // Quieter while a run is on: the birds are the idle layer.
      if (wantIntensity < 0.5 || Math.random() < 0.4) chirp();
      next();
    }, wait);
    bed.timers.push(t);
  };
  next();
}

function drone(bed: Bed, notes: number[], gain: number, type: OscillatorType) {
  const { ctx } = bed;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz(n);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(bed.duck);
    osc.start();
    lfo(ctx, 0.11 + Math.random() * 0.05, gain * 0.4, g.gain, bed);
    bed.sources.push(osc);
    bed.nodes.push(g);
  }
}

/** The pad: detuned saws on a chord through one breathing filter. */
function pad(bed: Bed) {
  const { ctx } = bed;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 520;
  filter.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.value = 0.03;
  filter.connect(g).connect(bed.duck);
  lfo(ctx, 0.06, 260, filter.frequency, bed);
  bed.nodes.push(filter, g);
  bed.filter = filter;
  bed.filterBase = 520;
  bed.filterOpen = 1400;

  // A minor: A2 C3 E3 G3. The VI is F: F2 A2 C3 E3 — three notes stay put.
  const I = [-24, -21, -17, -14];
  const VI = [-28, -24, -21, -17];
  const voices: OscillatorNode[] = [];
  I.forEach((n) => {
    for (const cents of [-7, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = hz(n);
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start();
      voices.push(osc);
      bed.sources.push(osc);
    }
  });

  let onI = true;
  const t = window.setInterval(() => {
    if (live !== bed) return;
    onI = !onI;
    const chord = onI ? I : VI;
    voices.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(hz(chord[Math.floor(i / 2)]), ctx.currentTime, 0.8);
    });
  }, 14000);
  bed.timers.push(t);
}

/**
 * The run layer: a low pulse, silent at intensity 0.
 *
 * A 55 Hz sine under a gain that rises and falls once a beat. The gain is a
 * sine LFO pushed through a curve that turns the wave into a narrow, smooth
 * bump — most of the cycle near silence, a rounded swell at the top — so the
 * result reads as a beat rather than a tremolo.
 *
 * It used to be a square-wave gate, which opened and shut the gain in a
 * single sample. A sine cut mid-cycle is a click, twice a beat, and on a
 * phone or laptop speaker that cannot reproduce 55 Hz the click was the only
 * part of this layer anyone could hear: a crackle that began the moment the
 * run clock started, which is the moment the character first moves. Every
 * edge here is now a curve, and there is nothing left to click.
 */
function pulse(bed: Bed, rateHz: number) {
  const { ctx } = bed;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 55;
  const gate = ctx.createGain();
  gate.gain.value = 0;
  const clock = ctx.createOscillator();
  clock.type = "sine";
  clock.frequency.value = rateHz;
  const shaper = ctx.createWaveShaper();
  // Sine in -1..1 → ((x + 1) / 2)^4 in 0..1. The fourth power is what makes
  // it a bump: a plain half-sine would be open for most of the beat.
  const N = 256;
  const curve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 2 - 1;
    curve[i] = Math.pow((x + 1) / 2, 4);
  }
  shaper.curve = curve;
  clock.connect(shaper).connect(gate.gain);
  osc.connect(gate).connect(bed.pulseGain);
  osc.start();
  clock.start();
  bed.sources.push(osc, clock);
  bed.nodes.push(gate, shaper);
}

function build(mood: Mood): Bed | null {
  const a = audioBus();
  if (!a || a.ctx.state !== "running") return null;
  const { ctx } = a;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(a.bus.music);
  const duck = ctx.createGain();
  duck.gain.value = wantDuck;
  duck.connect(out);
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0;
  pulseGain.connect(duck);

  const bed: Bed = {
    ctx,
    mood,
    out,
    nodes: [out, duck, pulseGain],
    sources: [],
    timers: [],
    filter: null,
    filterBase: 0,
    filterOpen: 0,
    windGain: null,
    windBase: 0,
    pulseGain,
    duck,
  };

  if (mood === "natural") {
    wind(bed, 420, 0.07, 0.5);
    birds(bed);
    pulse(bed, 1.9);
  } else if (mood === "cozy") {
    wind(bed, 220, 0.04, 0.3);
    drone(bed, [-33, -26], 0.018, "sine");
    pulse(bed, 1.6);
  } else {
    pad(bed);
    pulse(bed, 140 / 60);
  }

  // Fade in over two seconds; a bed that starts at full level is a cue.
  out.gain.setTargetAtTime(MIX, ctx.currentTime, 0.7);
  return bed;
}

/** Start the bed for a mood, or switch to it. Same mood: nothing happens. */
export function startAmbient(mood: Mood) {
  if (live?.mood === mood) return;
  stopAmbient();
  live = build(mood);
  applyIntensity();
}

/** Retry once the context exists — start returns nothing before a gesture. */
export function ambientPlaying(): boolean {
  return live !== null;
}

export function stopAmbient() {
  const bed = live;
  if (!bed) return;
  live = null;
  for (const t of bed.timers) {
    window.clearTimeout(t);
    window.clearInterval(t);
  }
  const t = bed.ctx.currentTime;
  bed.out.gain.cancelScheduledValues(t);
  bed.out.gain.setTargetAtTime(0, t, 0.25);
  const stopAt = t + 1.2;
  for (const s of bed.sources) s.stop(stopAt);
  window.setTimeout(() => {
    for (const n of bed.nodes) n.disconnect();
    for (const s of bed.sources) s.disconnect();
  }, 1600);
}

function applyIntensity() {
  const bed = live;
  if (!bed) return;
  const k = Math.max(0, Math.min(1, wantIntensity));
  const t = bed.ctx.currentTime;
  if (bed.filter) {
    bed.filter.frequency.setTargetAtTime(bed.filterBase + (bed.filterOpen - bed.filterBase) * k, t, 1.2);
  }
  if (bed.windGain) {
    bed.windGain.gain.setTargetAtTime(bed.windBase * (1 + 0.6 * k), t, 1.0);
  }
  bed.pulseGain.gain.setTargetAtTime(0.04 * k * k, t, 0.8);
}

/** How much is going on: 0 idle, 1 mid-run. Moves the bed over a second or so. */
export function setAmbientIntensity(k: number) {
  wantIntensity = k;
  applyIntensity();
}

/** Push the bed down under something else — the arcade's track, a cabinet. */
export function setAmbientDuck(level: number) {
  wantDuck = Math.max(0, Math.min(1, level));
  if (live) live.duck.gain.setTargetAtTime(wantDuck, live.ctx.currentTime, 0.3);
}
