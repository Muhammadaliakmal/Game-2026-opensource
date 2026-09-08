import { audioBus } from "@/lib/audio";
import { mulberry32 } from "./rng";

/**
 * The arcade's music: phonk, synthesised, no files.
 *
 * ── Why a synth and not an mp3 ───────────────────────────────────────────
 *
 * A loop long enough not to bore anybody is a megabyte or two, and the whole
 * arcade — two games, the host, the overlay — is smaller than that. It is also
 * a licence somebody has to hold, a decode before the first note, and a
 * request that can fail on the one screen where failing quietly is not an
 * option: silence is indistinguishable from a bug. Everything else in this
 * game is generated (the sky, the courses, the avatar, every sound effect
 * already), so a generated track is the house style rather than a stunt.
 *
 * It also buys the thing a file cannot: the track is seeded, so two runs are
 * not the same four bars, and it is *parameterised*, so a cabinet can be given
 * its own tempo without anyone opening a DAW.
 *
 * ── What makes it phonk rather than generic chiptune ─────────────────────
 *
 * Four things, and all four are load-bearing — drop any one and this reads as
 * a menu jingle:
 *
 * 1. **The cowbell.** The genre's signature, and the 808's is a specific
 *    recipe rather than a beep: two square waves a hair under a perfect fifth
 *    apart (the classic ratio is ~1.48, deliberately NOT 1.5 — the clash is
 *    the sound), through a band-pass, with a decay short enough to click.
 * 2. **Sliding 808 bass.** A sine that glides between notes instead of
 *    stepping to them, saturated until it is nearly square. The glide is the
 *    hook; without it this is just a bass note.
 * 3. **Half-time drums.** One snare on beat 3, not on 2 and 4. That single
 *    change is what makes 140 BPM feel like 70 and gives the cowbell room.
 * 4. **Hat rolls.** Straight sixteenths with occasional triplet or 32nd
 *    bursts, which is the whole trap vocabulary this borrows from.
 *
 * ── Scheduling ───────────────────────────────────────────────────────────
 *
 * Notes are scheduled ahead against `AudioContext.currentTime`, never played
 * "now" from a timer: a `setInterval` fires whenever the main thread is free,
 * and this one shares a thread with a game loop. The timer only decides *what*
 * to schedule; the audio clock decides when it sounds. That is the standard
 * two-clock arrangement, and it is why the beat does not stutter when a game
 * has a heavy frame.
 */

/** How far ahead notes are scheduled, and how often the scheduler wakes. */
const LOOKAHEAD_S = 0.15;
const TICK_MS = 40;

/** Music sits under the sound effects rather than over them. */
const MIX = 0.55;

/** Default tempo. Written as phonk is: fast on paper, half-time in the ear. */
const DEFAULT_BPM = 140;

/**
 * The key, as semitones from A4, and the scale the cowbell riff walks.
 *
 * F# minor, an octave and a half down, because that is where the genre lives —
 * and a minor pentatonic, because every note in it works against every other
 * one, which is what lets the riff be chosen at random and still be a riff.
 */
const ROOT = -15; // F#2-ish
export const PENTATONIC = [0, 3, 5, 7, 10];

const hz = (semis: number) => 440 * Math.pow(2, semis / 12);

/**
 * Sixteen steps to the bar.
 *
 * `1` is a hit. The kick pattern is deliberately off the grid on the second
 * half of the bar — a kick on every downbeat is house, not this.
 */
export const KICKS = [
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
];

/** Half-time: one backbeat, landing on 3. */
const SNARE_STEP = 8;

/**
 * Cowbell riffs, as indices into the pentatonic with -1 for a rest.
 *
 * Written by hand rather than generated. A riff is the one part of this a
 * random walk cannot do — it needs repetition to be a hook, and repetition is
 * exactly what randomness will not give you.
 */
export const RIFFS = [
  [0, -1, 0, 2, -1, 1, -1, 0, -1, 2, -1, 3, -1, 2, 1, -1],
  [4, -1, 3, -1, 2, -1, 0, -1, 0, -1, 2, 3, -1, 2, -1, -1],
  [0, 0, -1, 3, -1, 2, -1, -1, 4, -1, 3, -1, 2, -1, 1, -1],
  [2, -1, -1, 0, -1, 0, 2, -1, 3, -1, 4, -1, 3, 2, -1, -1],
];

/** Where the 808 lands, and which scale degree it slides to. */
export const BASS = [
  { step: 0, from: 0, to: 0 },
  { step: 6, from: 0, to: 3 },
  { step: 10, from: 2, to: 0 },
];

interface Live {
  ctx: AudioContext;
  /** Everything the music makes hangs here, so stopping is one ramp. */
  bus: GainNode;
  noise: AudioBuffer;
  /** Saturation for the 808, shared: a curve is 1 kB and never changes. */
  shaper: WaveShaperNode;
  timer: number;
  /** The audio-clock time of the next step, and which step it is. */
  nextAt: number;
  step: number;
  bar: number;
  spb: number;
  rng: () => number;
  riff: number[];
  kick: number[];
}

let live: Live | null = null;

/**
 * A soft-clip curve.
 *
 * `tanh`-shaped rather than a hard clip: an 808 is a sine driven until it
 * nearly squares off, and a hard clip there buzzes instead of thickening.
 */
function saturation(ctx: AudioContext): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

/** An envelope that ends in silence. Exponential ramps cannot reach zero. */
function envelope(ctx: AudioContext, at: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  // 4 ms of attack rather than none: a gain that steps from nothing to full is
  // a click on top of every note, and at this note density that is a buzz.
  g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  return g;
}

/** Kick: a sine dropped through its own pitch envelope. */
function kick(L: Live, at: number) {
  const osc = L.ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(130, at);
  osc.frequency.exponentialRampToValueAtTime(44, at + 0.09);
  const env = envelope(L.ctx, at, 0.9, 0.3);
  osc.connect(env).connect(L.bus);
  osc.start(at);
  osc.stop(at + 0.32);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

/** Snare: noise through a band-pass, with a short tonal body under it. */
function snare(L: Live, at: number) {
  const src = L.ctx.createBufferSource();
  src.buffer = L.noise;
  const bp = L.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 0.8;
  const env = envelope(L.ctx, at, 0.5, 0.18);
  src.connect(bp).connect(env).connect(L.bus);
  src.start(at);
  src.stop(at + 0.2);

  const body = L.ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(230, at);
  body.frequency.exponentialRampToValueAtTime(150, at + 0.1);
  const bodyEnv = envelope(L.ctx, at, 0.22, 0.12);
  body.connect(bodyEnv).connect(L.bus);
  body.start(at);
  body.stop(at + 0.14);
  body.onended = () => {
    body.disconnect();
    bodyEnv.disconnect();
    src.disconnect();
    bp.disconnect();
    env.disconnect();
  };
}

/** Hat: high-passed noise, gone almost before it arrives. */
function hat(L: Live, at: number, gain: number, open = false) {
  const src = L.ctx.createBufferSource();
  src.buffer = L.noise;
  // Playback rate as well as filtering: it is the cheapest way to make two
  // hats out of one buffer sound like two hats rather than one repeated.
  src.playbackRate.value = 1.4 + L.rng() * 0.3;
  const hp = L.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const env = envelope(L.ctx, at, gain, open ? 0.12 : 0.035);
  src.connect(hp).connect(env).connect(L.bus);
  src.start(at);
  src.stop(at + 0.16);
  src.onended = () => {
    src.disconnect();
    hp.disconnect();
    env.disconnect();
  };
}

/**
 * The cowbell.
 *
 * Two squares at a ratio just under a fifth, band-passed and cut short. The
 * ratio is the part that matters: at exactly 1.5 the two notes agree and it
 * chimes, and the 808's cowbell has never chimed.
 */
function cowbell(L: Live, at: number, freq: number, gain: number) {
  const bp = L.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 2.6;
  bp.Q.value = 1.4;
  const env = envelope(L.ctx, at, gain, 0.14);
  bp.connect(env).connect(L.bus);

  const oscs = [freq, freq * 1.4815].map((f) => {
    const osc = L.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    osc.connect(bp);
    osc.start(at);
    osc.stop(at + 0.18);
    return osc;
  });
  oscs[1].onended = () => {
    for (const o of oscs) o.disconnect();
    bp.disconnect();
    env.disconnect();
  };
}

/** The 808: a saturated sine that slides from one note to the next. */
function eight08(L: Live, at: number, from: number, to: number, dur: number) {
  const osc = L.ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, at);
  // The slide takes a fifth of the note. Any slower and it is a portamento
  // pad; any faster and it is two notes with a glitch between them.
  osc.frequency.exponentialRampToValueAtTime(to, at + dur * 0.2);
  const env = envelope(L.ctx, at, 0.85, dur);
  osc.connect(L.shaper).connect(env).connect(L.bus);
  osc.start(at);
  osc.stop(at + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
}

/** Schedule one sixteenth, whatever is on it. */
function schedule(L: Live, step: number, at: number) {
  if (L.kick[step]) kick(L, at);
  if (step === SNARE_STEP) snare(L, at);

  // Hats on every sixteenth, accented on the beat, with the occasional roll —
  // three or four hits inside one step. The roll is what stops a straight
  // sixteenth pattern reading as a metronome.
  const accent = step % 4 === 0;
  if (L.rng() < 0.14) {
    const hits = L.rng() < 0.5 ? 3 : 4;
    for (let i = 0; i < hits; i++) {
      hat(L, at + (i * L.spb) / hits, 0.1 + i * 0.02);
    }
  } else {
    hat(L, at, accent ? 0.22 : 0.13, step === 14);
  }

  const degree = L.riff[step];
  if (degree >= 0) {
    // Two octaves up from the bass, which is where a cowbell riff sits, and a
    // touch of velocity variation so repeats are not photocopies.
    const note = ROOT + 24 + PENTATONIC[degree];
    cowbell(L, at, hz(note), 0.16 + L.rng() * 0.05);
  }

  for (const b of BASS) {
    if (b.step !== step) continue;
    eight08(L, at, hz(ROOT + PENTATONIC[b.from]), hz(ROOT + PENTATONIC[b.to]), L.spb * 3.2);
  }
}

/** The scheduler: schedule everything that falls inside the lookahead. */
function tick() {
  const L = live;
  if (!L) return;
  while (L.nextAt < L.ctx.currentTime + LOOKAHEAD_S) {
    schedule(L, L.step, L.nextAt);
    L.nextAt += L.spb;
    L.step++;
    if (L.step >= 16) {
      L.step = 0;
      L.bar++;
      // A new riff every four bars, and a new kick pattern every two. Chosen
      // from the seeded stream, so a run's music is reproducible along with
      // the rest of it.
      if (L.bar % 2 === 0) L.kick = KICKS[Math.floor(L.rng() * KICKS.length)];
      if (L.bar % 4 === 0) L.riff = RIFFS[Math.floor(L.rng() * RIFFS.length)];
    }
  }
}

/**
 * Start the track. Safe to call when it is already playing — the second call
 * is ignored rather than starting a second band.
 *
 * `seed` ties the music to the run, so a replayed seed is a replayed track.
 */
export function startMusic(seed: number, bpm = DEFAULT_BPM): void {
  if (live) return;
  const bus = audioBus();
  if (!bus) return;
  // Suspended means the page has had no gesture yet. Opening a cabinet is one,
  // so this normally resumes immediately; if it does not, the scheduler still
  // runs and the first audible bar is simply late rather than missing.
  if (bus.ctx.state === "suspended") void bus.ctx.resume();

  const gain = bus.ctx.createGain();
  gain.gain.value = MIX;
  gain.connect(bus.master);

  const rng = mulberry32(seed);
  live = {
    ctx: bus.ctx,
    bus: gain,
    noise: bus.noise,
    shaper: saturation(bus.ctx),
    timer: window.setInterval(tick, TICK_MS),
    // A beat of daylight before the first note: scheduling into the past is
    // the one way a WebAudio sequencer plays its whole first bar at once.
    nextAt: bus.ctx.currentTime + 0.1,
    step: 0,
    bar: 0,
    spb: 60 / bpm / 4,
    rng,
    riff: RIFFS[Math.floor(rng() * RIFFS.length)],
    kick: KICKS[Math.floor(rng() * KICKS.length)],
  };
  tick();
}

/**
 * Stop it.
 *
 * Notes inside the lookahead are already scheduled and cannot be unscheduled,
 * so the bus is faded instead — 120 ms, which is under a sixteenth at any
 * tempo here and so is heard as an ending rather than as a cut. The node is
 * dropped afterwards, which is what actually releases those voices.
 */
export function stopMusic(): void {
  const L = live;
  if (!L) return;
  live = null;
  window.clearInterval(L.timer);
  const end = L.ctx.currentTime + 0.12;
  L.bus.gain.cancelScheduledValues(L.ctx.currentTime);
  L.bus.gain.setValueAtTime(L.bus.gain.value, L.ctx.currentTime);
  L.bus.gain.exponentialRampToValueAtTime(0.0001, end);
  window.setTimeout(() => {
    L.bus.disconnect();
    L.shaper.disconnect();
  }, 400);
}

/** For the host's own teardown checks. */
export const musicPlaying = () => live !== null;
