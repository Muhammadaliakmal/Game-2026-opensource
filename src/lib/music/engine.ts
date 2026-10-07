import { audioBus } from "@/lib/audio";
import { mulberry32 } from "@/arcade/host/rng";
import { degreeSemis, STYLES, type BassNote, type MusicStyle, type StyleId } from "./styles";

/**
 * The game's one band: performs any style in `styles.ts`, synthesised, no
 * files — for the reasons the arcade's phonk gave when it was the only track
 * (size, licence, a decode before the first note; and a seeded track is a
 * different four bars every run).
 *
 * ── Who is playing ───────────────────────────────────────────────────────
 *
 * Tracks are requested by an owner and kept on a stack; the top one plays. A
 * cabinet opened over a parkour world pushes its own track over the world's,
 * and closing it pops back to the night run without the world having to know
 * a cabinet was ever open. Changing the top crossfades — a half-second, which
 * is a change of scene rather than a cut.
 *
 * ── Scheduling ───────────────────────────────────────────────────────────
 *
 * Notes are scheduled ahead on the audio clock; the timer only decides what
 * to schedule. A `setInterval` shares its thread with a game loop, and a
 * heavy frame would otherwise be a late snare.
 */

const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;
/** Music sits under the effects. */
const MIX = 0.55;
const FADE_S = 0.5;

const hz = (semis: number) => 440 * Math.pow(2, semis / 12);

interface Request {
  owner: string;
  style: StyleId;
  seed: number;
  bpm?: number;
}

interface Band {
  ctx: AudioContext;
  style: MusicStyle;
  out: GainNode;
  /** Dry voices land here; it feeds `out` and both sends. */
  mix: GainNode;
  verb: ConvolverNode;
  verbSend: GainNode;
  echo: DelayNode;
  echoSend: GainNode;
  echoFb: GainNode;
  noise: AudioBuffer;
  shaper: WaveShaperNode;
  timer: number;
  nextAt: number;
  step: number;
  bar: number;
  spb: number;
  rng: () => number;
  riff: number[] | null;
  kick: number[];
}

const stack: Request[] = [];
let band: Band | null = null;
let playingKey = "";

/* ── Shared shapes ─────────────────────────────────────────────────────── */

const curves = new WeakMap<AudioContext, Float32Array<ArrayBuffer>>();
function saturation(ctx: AudioContext): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  let curve = curves.get(ctx);
  if (!curve) {
    const n = 1024;
    curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * 2.2);
    curves.set(ctx, curve);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

/** A room: two seconds of decaying stereo noise, built once per context. */
const rooms = new WeakMap<AudioContext, AudioBuffer>();
function room(ctx: AudioContext): AudioBuffer {
  let buf = rooms.get(ctx);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 2.2);
  buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const rng = mulberry32(7);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (rng() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  rooms.set(ctx, buf);
  return buf;
}

/** An envelope that ends in silence. Exponential ramps cannot reach zero. */
function env(ctx: AudioContext, at: number, peak: number, decay: number, attack = 0.004): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}

/** Start an oscillator through a chain and clean all of it up when it ends. */
function osc(
  B: Band,
  type: OscillatorType,
  freq: number,
  at: number,
  dur: number,
  chain: AudioNode[],
  detune = 0
): OscillatorNode {
  const o = B.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.detune.value = detune;
  let prev: AudioNode = o;
  for (const n of chain) prev = prev.connect(n);
  prev.connect(B.mix);
  o.start(at);
  o.stop(at + dur + 0.05);
  o.onended = () => {
    o.disconnect();
    for (const n of chain) n.disconnect();
  };
  return o;
}

function noise(B: Band, at: number, dur: number, chain: AudioNode[], rate = 1) {
  const s = B.ctx.createBufferSource();
  s.buffer = B.noise;
  s.playbackRate.value = rate;
  let prev: AudioNode = s;
  for (const n of chain) prev = prev.connect(n);
  prev.connect(B.mix);
  s.start(at);
  s.stop(at + dur + 0.02);
  s.onended = () => {
    s.disconnect();
    for (const n of chain) n.disconnect();
  };
}

function filter(ctx: AudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}

/* ── Drums ─────────────────────────────────────────────────────────────── */

function kick(B: Band, at: number) {
  const tone = B.style.kickTone;
  const o = B.ctx.createOscillator();
  o.type = "sine";
  const top = tone === "punch" ? 160 : tone === "soft" ? 110 : 130;
  const bottom = tone === "808" ? 44 : 50;
  o.frequency.setValueAtTime(top, at);
  o.frequency.exponentialRampToValueAtTime(bottom, at + (tone === "punch" ? 0.06 : 0.09));
  const e = env(B.ctx, at, tone === "soft" ? 0.6 : 0.9, tone === "808" ? 0.3 : 0.22);
  o.connect(e).connect(B.mix);
  o.start(at);
  o.stop(at + 0.35);
  o.onended = () => {
    o.disconnect();
    e.disconnect();
  };
  // A punch kick has a click on the front, which is what cuts through a pad.
  if (tone === "punch") noise(B, at, 0.02, [filter(B.ctx, "highpass", 3000), env(B.ctx, at, 0.18, 0.012)]);
}

function snare(B: Band, at: number) {
  const v = B.style.snareVoice;
  if (v === "rim") {
    osc(B, "triangle", 820, at, 0.05, [filter(B.ctx, "bandpass", 1700, 3), env(B.ctx, at, 0.22, 0.04)]);
    return;
  }
  if (v === "clap") {
    // Three bursts a few milliseconds apart is what makes noise a clap.
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.011;
      noise(B, t, 0.12, [filter(B.ctx, "bandpass", 1300, 1.2), env(B.ctx, t, 0.32, i === 2 ? 0.12 : 0.01)]);
    }
    return;
  }
  const decay = v === "gated" ? 0.26 : 0.18;
  noise(B, at, decay + 0.02, [filter(B.ctx, "bandpass", v === "gated" ? 1500 : 1900, 0.8), env(B.ctx, at, 0.45, decay)]);
  const body = osc(B, "triangle", 230, at, 0.14, [env(B.ctx, at, 0.2, 0.12)]);
  body.frequency.exponentialRampToValueAtTime(150, at + 0.1);
}

function hat(B: Band, at: number, gain: number, open = false) {
  noise(B, at, 0.16, [filter(B.ctx, "highpass", 7000), env(B.ctx, at, gain, open ? 0.12 : 0.035)], 1.4 + B.rng() * 0.3);
}

function shaker(B: Band, at: number, gain: number) {
  noise(B, at, 0.08, [filter(B.ctx, "bandpass", 6000, 1.5), env(B.ctx, at, gain, 0.05, 0.012)], 1.2);
}

/* ── Pitched voices ────────────────────────────────────────────────────── */

function lead(B: Band, at: number, f: number, gain: number) {
  const voice = B.style.lead!.voice;
  switch (voice) {
    case "cowbell": {
      // Two squares a hair under a fifth apart — the clash is the sound.
      const bp = filter(B.ctx, "bandpass", f * 2.6, 1.4);
      const e = env(B.ctx, at, gain, 0.14);
      bp.connect(e).connect(B.mix);
      const oscs = [f, f * 1.4815].map((fr) => {
        const o = B.ctx.createOscillator();
        o.type = "square";
        o.frequency.value = fr;
        o.connect(bp);
        o.start(at);
        o.stop(at + 0.18);
        return o;
      });
      oscs[1].onended = () => {
        for (const o of oscs) o.disconnect();
        bp.disconnect();
        e.disconnect();
      };
      return;
    }
    case "bell":
      osc(B, "sine", f, at, 1.6, [env(B.ctx, at, gain, 1.5)]);
      osc(B, "sine", f * 3.01, at, 0.5, [env(B.ctx, at, gain * 0.35, 0.4)]);
      return;
    case "marimba":
      osc(B, "sine", f, at, 0.35, [env(B.ctx, at, gain, 0.3)]);
      osc(B, "sine", f * 4, at, 0.08, [env(B.ctx, at, gain * 0.4, 0.05)]);
      return;
    case "square":
      osc(B, "square", f, at, 0.2, [filter(B.ctx, "lowpass", 2200), env(B.ctx, at, gain, 0.16)]);
      return;
    case "keys":
      electricPiano(B, at, f, gain, 1.2);
      return;
  }
}

/** A Rhodes, roughly: a sine with a bell overtone and a slow tremolo. */
function electricPiano(B: Band, at: number, f: number, gain: number, dur: number) {
  const e = env(B.ctx, at, gain, dur, 0.008);
  const trem = B.ctx.createGain();
  trem.gain.value = 0.85;
  const lfo = B.ctx.createOscillator();
  const depth = B.ctx.createGain();
  lfo.frequency.value = 4.5;
  depth.gain.value = 0.15;
  lfo.connect(depth).connect(trem.gain);
  lfo.start(at);
  lfo.stop(at + dur + 0.05);
  lfo.onended = () => {
    lfo.disconnect();
    depth.disconnect();
  };
  osc(B, "sine", f, at, dur, [trem, e]);
  osc(B, "sine", f * 2, at, 0.3, [env(B.ctx, at, gain * 0.25, 0.25)]);
}

function bassNote(B: Band, at: number, from: number, to: number, dur: number) {
  const v = B.style.bass!.voice;
  if (v === "808") {
    const o = B.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + dur * 0.2);
    const e = env(B.ctx, at, 0.85, dur);
    o.connect(B.shaper).connect(e).connect(B.mix);
    o.start(at);
    o.stop(at + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      e.disconnect();
    };
    return;
  }
  if (v === "sub") {
    osc(B, "sine", from, at, dur, [env(B.ctx, at, 0.55, dur, 0.03)]);
    return;
  }
  if (v === "pluck") {
    osc(B, "triangle", from, at, dur, [filter(B.ctx, "lowpass", 900), env(B.ctx, at, 0.5, dur * 0.7)]);
    return;
  }
  // Saw: a filter that closes on every note, which is the whole synthwave bass.
  const lp = filter(B.ctx, "lowpass", 1400, 4);
  lp.frequency.setValueAtTime(1400, at);
  lp.frequency.exponentialRampToValueAtTime(220, at + dur);
  osc(B, "sawtooth", from, at, dur, [lp, env(B.ctx, at, 0.32, dur)]);
}

function padChord(B: Band, at: number, notes: number[], dur: number) {
  const v = B.style.pad!;
  if (v === "keys") {
    // Struck, not held: one chord on the bar, a softer one on the "and" of 2.
    for (const n of notes) electricPiano(B, at, hz(n), 0.06, dur * 0.55);
    for (const n of notes.slice(1)) electricPiano(B, at + B.spb * 6 + B.spb * B.style.swing, hz(n), 0.035, dur * 0.3);
    return;
  }
  const type: OscillatorType = v === "glass" ? "sawtooth" : "triangle";
  const lp = filter(B.ctx, "lowpass", v === "glass" ? 1800 : 1100);
  const g = B.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(v === "glass" ? 0.05 : 0.08, at + dur * 0.3);
  g.gain.setValueAtTime(v === "glass" ? 0.05 : 0.08, at + dur * 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.05);
  lp.connect(g).connect(B.mix);
  const oscs = notes.flatMap((n) =>
    [-7, 7].map((cents) => {
      const o = B.ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz(n);
      o.detune.value = cents;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur * 1.1);
      return o;
    })
  );
  oscs[oscs.length - 1].onended = () => {
    for (const o of oscs) o.disconnect();
    lp.disconnect();
    g.disconnect();
  };
}

/* ── The sequencer ─────────────────────────────────────────────────────── */

function chordFor(B: Band): number[] {
  return B.style.chords[B.bar % B.style.chords.length];
}

function bassAt(B: Band, n: BassNote, chordRoot: number): [number, number] {
  const s = B.style;
  const base = s.root - 12 + chordRoot + 12 * (n.oct ?? 0);
  return [hz(base + degreeSemis(s.scale, n.from)), hz(base + degreeSemis(s.scale, n.to))];
}

function schedule(B: Band, step: number, at: number) {
  const s = B.style;
  // Swing: the off-beat sixteenths land late.
  const t = step % 2 === 1 ? at + B.spb * s.swing : at;
  const chord = chordFor(B);

  if (B.kick[step]) kick(B, t);
  if (s.snares.includes(step)) snare(B, t);

  switch (s.hats) {
    case "sixteenth": {
      if (B.rng() < s.hatRoll) {
        const hits = B.rng() < 0.5 ? 3 : 4;
        for (let i = 0; i < hits; i++) hat(B, t + (i * B.spb) / hits, 0.08 + i * 0.02);
      } else hat(B, t, step % 4 === 0 ? 0.16 : 0.09, step === 14);
      break;
    }
    case "eighth":
      if (step % 2 === 0) hat(B, t, step % 4 === 0 ? 0.08 : 0.05);
      break;
    case "offbeat":
      if (step % 4 === 2) hat(B, t, 0.14, true);
      else hat(B, t, 0.04);
      break;
    case "shaker":
      shaker(B, t, step % 2 === 0 ? 0.09 : 0.05);
      break;
  }

  if (s.crackle && B.rng() < 0.35) {
    noise(B, at + B.rng() * B.spb, 0.01, [filter(B.ctx, "highpass", 2500), env(B.ctx, at, 0.05 + B.rng() * 0.05, 0.004, 0.001)], 0.6 + B.rng());
  }

  if (step === 0 && s.pad) {
    padChord(B, at, chord.map((c) => s.root + c), B.spb * 16);
  }

  if (s.arp) {
    const idx = s.arp.pattern[step];
    if (idx >= 0) {
      const tone = chord[idx % chord.length] + 12 * Math.floor(idx / chord.length);
      const f = hz(s.root + 12 * s.arp.octave + tone);
      const lp = filter(B.ctx, "lowpass", 2600);
      osc(B, "sawtooth", f, t, 0.18, [lp, env(B.ctx, t, s.arp.gain, 0.16)]);
    }
  }

  if (s.lead && B.riff) {
    const degree = B.riff[step];
    if (degree >= 0) {
      const f = hz(s.root + 12 * s.lead.octave + degreeSemis(s.scale, degree));
      lead(B, t, f, s.lead.gain * (0.85 + B.rng() * 0.3));
    }
  }

  if (s.bass) {
    for (const n of s.bass.notes) {
      if (n.step !== step) continue;
      const [from, to] = bassAt(B, n, chord[0]);
      bassNote(B, t, from, to, B.spb * n.len);
    }
  }
}

function tick() {
  const B = band;
  if (!B) return;
  while (B.nextAt < B.ctx.currentTime + LOOKAHEAD_S) {
    schedule(B, B.step, B.nextAt);
    B.nextAt += B.spb;
    B.step++;
    if (B.step >= 16) {
      B.step = 0;
      B.bar++;
      const s = B.style;
      if (B.bar % 2 === 0) B.kick = s.kicks[Math.floor(B.rng() * s.kicks.length)];
      if (B.bar % 4 === 0 && s.lead) B.riff = s.lead.riffs[Math.floor(B.rng() * s.lead.riffs.length)];
    }
  }
}

function startBand(req: Request): Band | null {
  const graph = audioBus();
  if (!graph) return null;
  const { ctx } = graph;
  if (ctx.state === "suspended") void ctx.resume();
  const style = STYLES[req.style];

  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(MIX, ctx.currentTime + FADE_S);
  out.connect(graph.bus.music);

  const mix = ctx.createGain();
  mix.connect(out);

  const verb = ctx.createConvolver();
  verb.buffer = room(ctx);
  const verbSend = ctx.createGain();
  verbSend.gain.value = style.reverb;
  mix.connect(verbSend).connect(verb).connect(out);

  const spb = 60 / (req.bpm ?? style.bpm) / 4;
  const echo = ctx.createDelay(2);
  // A dotted eighth: the echo every pad record since 1983 has used.
  echo.delayTime.value = spb * 3;
  const echoSend = ctx.createGain();
  echoSend.gain.value = style.echo;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.35;
  const echoTone = filter(ctx, "lowpass", 2400);
  mix.connect(echoSend).connect(echo).connect(echoTone).connect(out);
  echoTone.connect(echoFb).connect(echo);

  const rng = mulberry32(req.seed);
  const B: Band = {
    ctx,
    style,
    out,
    mix,
    verb,
    verbSend,
    echo,
    echoSend,
    echoFb,
    noise: graph.noise,
    shaper: saturation(ctx),
    timer: window.setInterval(tick, TICK_MS),
    nextAt: ctx.currentTime + 0.1,
    step: 0,
    bar: 0,
    spb,
    rng,
    riff: style.lead ? style.lead.riffs[Math.floor(rng() * style.lead.riffs.length)] : null,
    kick: style.kicks[Math.floor(rng() * style.kicks.length)],
  };
  return B;
}

function fadeOut(B: Band, seconds: number) {
  window.clearInterval(B.timer);
  const now = B.ctx.currentTime;
  B.out.gain.cancelScheduledValues(now);
  B.out.gain.setValueAtTime(Math.max(B.out.gain.value, 0.0002), now);
  B.out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  window.setTimeout(() => {
    B.out.disconnect();
    B.mix.disconnect();
    B.verb.disconnect();
    B.verbSend.disconnect();
    B.echo.disconnect();
    B.echoSend.disconnect();
    B.echoFb.disconnect();
    B.shaper.disconnect();
  }, seconds * 1000 + 600);
}

/** Make the band play whatever is on top of the stack. */
function sync() {
  const top = stack[stack.length - 1];
  const key = top ? `${top.owner}|${top.style}|${top.seed}|${top.bpm ?? ""}` : "";
  if (key === playingKey && (band || !top)) return;
  if (band) {
    fadeOut(band, top ? FADE_S : 0.12);
    band = null;
  }
  playingKey = "";
  if (!top) return;
  band = startBand(top);
  if (!band) return;
  playingKey = key;
  tick();
}

/**
 * Ask for a track. The latest request plays; asking again with the same
 * owner replaces that owner's request. Returns false when there is no audio
 * yet (no gesture) — call again later; `useMusic` does.
 */
export function playMusic(owner: string, style: StyleId, seed = 1, bpm?: number): boolean {
  const i = stack.findIndex((r) => r.owner === owner);
  if (i >= 0) stack.splice(i, 1);
  stack.push({ owner, style, seed, bpm });
  sync();
  return band !== null;
}

/** Withdraw an owner's request; whatever is under it plays again. */
export function stopMusicFor(owner: string): void {
  const i = stack.findIndex((r) => r.owner === owner);
  if (i < 0) return;
  stack.splice(i, 1);
  sync();
}

export const musicIsPlaying = () => band !== null;
export const currentStyle = (): StyleId | null => band?.style.id ?? null;
