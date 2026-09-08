/**
 * One WebAudio graph for the whole app, plus the mute the game was missing.
 *
 * Every sound is synthesised — a burst of white noise through a lowpass, or a
 * short pitched blip — so there are no audio files to ship or wait on. It all
 * hangs off a single lazily-created context behind one master gain, which is
 * what makes a global mute a one-line change instead of a hunt for every
 * sound source.
 *
 * Browsers refuse to start an AudioContext outside a user gesture, so the
 * context is created on first use and resumed on the first pointer or key
 * event; until then every play() call is a silent no-op rather than an error.
 */

const MUTE_KEY = "blockworld:muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let gestureBound = false;
let muted: boolean | null = null;
const listeners = new Set<(muted: boolean) => void>();

/** Master volume when unmuted. Matches FEEL.audioVolume. */
const VOLUME = 0.35;

export function isMuted(): boolean {
  if (muted === null) {
    // localStorage throws in some privacy modes; a missing preference is fine.
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* preference just won't persist */
  }
  if (master && ctx) {
    // Ramp rather than jump: an instant gain change on a live voice clicks.
    master.gain.setTargetAtTime(next ? 0 : VOLUME, ctx.currentTime, 0.01);
  }
  for (const l of listeners) l(next);
}

/** Subscribe to mute changes (so every mute button in the UI agrees). */
export function onMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resume() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** Create the graph on demand. Safe to call from anywhere, any number of times. */
function audio(): { ctx: AudioContext; master: GainNode; noise: AudioBuffer } | null {
  if (typeof window === "undefined") return null;

  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = isMuted() ? 0 : VOLUME;
    master.connect(ctx.destination);

    // 0.4s of white noise, reused by every percussive hit.
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  if (!gestureBound) {
    gestureBound = true;
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
  }

  if (!ctx || !master || !noise) return null;
  return { ctx, master, noise };
}

/** Prime the graph from a user gesture, so the first real sound isn't swallowed. */
export function primeAudio() {
  audio();
  resume();
}

/**
 * The shared graph, for sound that this file does not itself make.
 *
 * Everything hanging off `master` is muted by the one mute button and mixed at
 * the one volume, which is the entire argument for handing the bus out rather
 * than letting a caller build its own context. The arcade did build its own —
 * a second AudioContext with a second `muted` flag that nothing ever set — so
 * the mute button silenced the world and left the cabinets playing.
 *
 * Returns null before a context can exist (server render, or a browser with no
 * WebAudio). Callers must treat that as "no sound", never as an error.
 */
export function audioBus() {
  return audio();
}

/** A percussive burst of filtered noise — footsteps, landings, block placement. */
export function noiseHit(dur: number, cutoff: number, gain: number) {
  const a = audio();
  if (!a || a.ctx.state !== "running") return;

  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;

  const filter = a.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;

  const env = a.ctx.createGain();
  const now = a.ctx.currentTime;
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filter).connect(env).connect(a.master);
  src.start(now);
  src.stop(now + dur);
}

/** A short pitched blip — the editor's placement "tock". */
export function toneHit(
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = "triangle"
) {
  const a = audio();
  if (!a || a.ctx.state !== "running") return;

  const osc = a.ctx.createOscillator();
  osc.type = type;

  const env = a.ctx.createGain();
  const now = a.ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  // A slight downward glide is what makes it read as a "tock" rather than a beep.
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + dur);
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(env).connect(a.master);
  osc.start(now);
  osc.stop(now + dur);
}

// Drag-painting fires dozens of edits a second; without a floor the result is
// a buzz rather than a series of taps.
let lastEditSound = 0;
const EDIT_SOUND_GAP = 45; // ms

function throttled(fn: () => void) {
  const now = performance.now();
  if (now - lastEditSound < EDIT_SOUND_GAP) return;
  lastEditSound = now;
  fn();
}

/** Placement: a bright, short tock, detuned slightly per hit so runs don't drone. */
export function sfxPlace() {
  throttled(() => {
    toneHit(430 + Math.random() * 60, 0.07, 0.16);
    noiseHit(0.035, 2600, 0.07);
  });
}

/** Erase: duller and lower, so the two tools are distinguishable by ear alone. */
export function sfxErase() {
  throttled(() => {
    noiseHit(0.09, 620, 0.16);
  });
}

/** Moving the spawn point — a soft two-note confirmation. */
export function sfxSpawn() {
  toneHit(520, 0.09, 0.13, "sine");
  window.setTimeout(() => toneHit(780, 0.11, 0.11, "sine"), 70);
}
