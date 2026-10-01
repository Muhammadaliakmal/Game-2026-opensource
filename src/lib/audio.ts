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
 *
 * ── Buses ────────────────────────────────────────────────────────────────
 *
 * Under the master sit four buses, and every sound names the one it belongs
 * on: `ui` for the chrome, `game` for cues the rules emit (a checkpoint, a lap
 * bell, the engine), `impact` for the body hitting things (footsteps, a wall,
 * a punch) and `music` for the beds and the arcade's track. They exist so the
 * player can turn the music down without losing the footstep that tells them
 * they landed — one slider per bus in Settings — and so a knockdown can duck
 * everything but itself for a beat without touching the master.
 *
 * ── Voice cap ────────────────────────────────────────────────────────────
 *
 * A sound that names a `voice` is counted while it plays and refused past
 * `maxVoices` of the same name. Four footsteps at once is a stampede; a fifth
 * would be distortion on top of it. The count is released by `onended`, so a
 * voice that finished always frees its slot.
 *
 * ── Loudness ─────────────────────────────────────────────────────────────
 *
 * A compressor sits between the master and the output. Every sound here is
 * synthesised and hand-gained, and hand-gaining forty sounds to one level is
 * a thing nobody gets right — so the graph does the last few dB itself. A
 * gentle ratio with a soft knee: it catches a crash landing on top of a
 * stinger on top of the bed, and leaves a single footstep alone. It is the
 * one stage that keeps the mix calm during the loud moments, which is what
 * the sound spec asks for and what a startle at the peak would break.
 *
 * ── Tab blur ─────────────────────────────────────────────────────────────
 *
 * The context is suspended when the tab is hidden and resumed when it is
 * shown again. A hidden tab's audio is not something the player is listening
 * to, and a running context is a running thread on a phone whose battery
 * they will notice. Only a suspension this file made is undone here, so a
 * page that never had a gesture stays where the browser left it.
 */

const MUTE_KEY = "blockworld:muted";
const VOLUME_KEY = "blockworld:volume";

export type Bus = "ui" | "game" | "impact" | "music";
export const BUSES: readonly Bus[] = ["ui", "game", "impact", "music"];

export const BUS_LABELS: Record<Bus, string> = {
  ui: "Interface",
  game: "Game",
  impact: "Impacts",
  music: "Music",
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let buses: Record<Bus, GainNode> | null = null;
let noise: AudioBuffer | null = null;
let gestureBound = false;
let muted: boolean | null = null;
let volumes: Record<Bus, number> | null = null;
let hiddenByUs = false;
const listeners = new Set<(muted: boolean) => void>();
const volumeListeners = new Set<(v: Record<Bus, number>) => void>();

/** Master volume when unmuted. Matches FEEL.audioVolume. */
const VOLUME = 0.35;

/** Every bus at unity unless the player moved it. */
const DEFAULT_VOLUMES: Record<Bus, number> = { ui: 1, game: 1, impact: 1, music: 1 };

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

/**
 * Silence everything for a while without touching the player's setting.
 *
 * For a full-screen ad (`lib/game-ads.ts`), which Google requires the game
 * be quiet under. `setMuted` would do it, but it writes the preference to
 * storage — close the tab mid-ad and the game comes back muted for good.
 * This only moves the master gain, and lifting the hold restores whatever
 * the player's own choice was.
 */
export function holdSilence(on: boolean) {
  if (!master || !ctx) return;
  const to = on || isMuted() ? 0 : VOLUME;
  master.gain.setTargetAtTime(to, ctx.currentTime, 0.01);
}

/** Subscribe to mute changes (so every mute button in the UI agrees). */
export function onMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The saved per-bus volumes, 0..1 each. */
export function busVolumes(): Record<Bus, number> {
  if (volumes === null) {
    volumes = { ...DEFAULT_VOLUMES };
    try {
      const raw = window.localStorage.getItem(VOLUME_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<Bus, unknown>>;
        for (const b of BUSES) {
          const v = parsed[b];
          if (typeof v === "number" && Number.isFinite(v)) {
            volumes[b] = Math.min(1, Math.max(0, v));
          }
        }
      }
    } catch {
      /* defaults */
    }
  }
  return volumes;
}

export function setBusVolume(bus: Bus, value: number) {
  const v = Math.min(1, Math.max(0, value));
  const next = { ...busVolumes(), [bus]: v };
  volumes = next;
  try {
    window.localStorage.setItem(VOLUME_KEY, JSON.stringify(next));
  } catch {
    /* preference just won't persist */
  }
  if (buses && ctx) {
    buses[bus].gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }
  for (const l of volumeListeners) l(next);
}

export function onVolumeChange(fn: (v: Record<Bus, number>) => void): () => void {
  volumeListeners.add(fn);
  return () => volumeListeners.delete(fn);
}

function resume() {
  if (ctx && ctx.state === "suspended" && !hiddenByUs) void ctx.resume();
}

function onVisibility() {
  if (!ctx) return;
  if (document.hidden) {
    if (ctx.state === "running") {
      hiddenByUs = true;
      void ctx.suspend();
    }
  } else if (hiddenByUs) {
    hiddenByUs = false;
    void ctx.resume();
  }
}

/** Create the graph on demand. Safe to call from anywhere, any number of times. */
function audio(): {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  bus: Record<Bus, GainNode>;
} | null {
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

    // The loudness stage. Threshold high enough that ordinary play never
    // reaches it; the ratio only ever pulls the stacked peaks down. Fast in,
    // slow out, so it does not pump under the engine.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.22;
    master.connect(limiter).connect(ctx.destination);

    const saved = busVolumes();
    const made = {} as Record<Bus, GainNode>;
    for (const b of BUSES) {
      const g = ctx.createGain();
      g.gain.value = saved[b];
      g.connect(master);
      made[b] = g;
    }
    buses = made;

    // 0.4s of white noise, reused by every percussive hit.
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  if (!gestureBound) {
    gestureBound = true;
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    document.addEventListener("visibilitychange", onVisibility);
  }

  if (!ctx || !master || !noise || !buses) return null;
  return { ctx, master, noise, bus: buses };
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
 * Connect to `bus.<name>`, not to `master`: a source on the master is a source
 * no slider in Settings can reach.
 *
 * Returns null before a context can exist (server render, or a browser with no
 * WebAudio). Callers must treat that as "no sound", never as an error.
 */
export function audioBus() {
  return audio();
}

/** A multiplier a few percent either side of 1, for a sound that repeats. */
export const jitter = (pct: number) => 1 + (Math.random() * 2 - 1) * pct;

/**
 * Duck one bus for a moment — the silence after a knockdown, the beat before
 * the crowd. `hold` seconds at `to`, then back over `release`.
 */
export function duckBus(bus: Bus, to: number, hold: number, release = 0.25) {
  const a = audio();
  if (!a || a.ctx.state !== "running") return;
  const g = a.bus[bus].gain;
  const now = a.ctx.currentTime;
  const back = busVolumes()[bus];
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(back * to, now + 0.01);
  g.setValueAtTime(back * to, now + hold);
  g.linearRampToValueAtTime(back, now + hold + release);
}

export interface HitOptions {
  /** Which bus this sound sits on. Defaults to `game`. */
  bus?: Bus;
  /** -1 (left) .. 1 (right). Omit for centre. */
  pan?: number;
  /**
   * Playback-rate multiplier on a noise hit — the one way to pitch-shift a
   * buffer. 1.05 is five percent sharper.
   */
  rate?: number;
  /** Name under which this sound is counted against `maxVoices`. */
  voice?: string;
  /** How many of `voice` may sound at once. Default 4. */
  maxVoices?: number;
  /** Seconds from now to start. Lets a phrase be scheduled on the audio clock. */
  at?: number;
}

const activeVoices = new Map<string, number>();
const DEFAULT_MAX_VOICES = 4;

/** Take a slot for `voice`, or refuse. Returns the release function. */
function acquire(opts: HitOptions | undefined): (() => void) | null {
  const name = opts?.voice;
  if (!name) return () => {};
  const max = opts?.maxVoices ?? DEFAULT_MAX_VOICES;
  const n = activeVoices.get(name) ?? 0;
  if (n >= max) return null;
  activeVoices.set(name, n + 1);
  return () => activeVoices.set(name, Math.max(0, (activeVoices.get(name) ?? 1) - 1));
}

/** The tail of a chain: an optional panner, then the bus. */
function output(
  a: NonNullable<ReturnType<typeof audio>>,
  opts: HitOptions | undefined
): AudioNode {
  const dest = a.bus[opts?.bus ?? "game"];
  const pan = opts?.pan;
  if (pan === undefined || pan === 0 || typeof a.ctx.createStereoPanner !== "function") {
    return dest;
  }
  const p = a.ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(dest);
  return p;
}

/** A percussive burst of filtered noise — footsteps, landings, block placement. */
export function noiseHit(dur: number, cutoff: number, gain: number, opts?: HitOptions) {
  const a = audio();
  if (!a || a.ctx.state !== "running") return;
  const release = acquire(opts);
  if (!release) return;

  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  if (opts?.rate) src.playbackRate.value = opts.rate;

  const filter = a.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;

  const env = a.ctx.createGain();
  const now = a.ctx.currentTime + (opts?.at ?? 0);
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(filter).connect(env).connect(output(a, opts));
  src.start(now);
  src.stop(now + dur);
  src.onended = release;
}

/** A short pitched blip — the editor's placement "tock". */
export function toneHit(
  freq: number,
  dur: number,
  gain: number,
  type: OscillatorType = "triangle",
  opts?: HitOptions & { glide?: number }
) {
  const a = audio();
  if (!a || a.ctx.state !== "running") return;
  const release = acquire(opts);
  if (!release) return;

  const osc = a.ctx.createOscillator();
  osc.type = type;

  const env = a.ctx.createGain();
  const now = a.ctx.currentTime + (opts?.at ?? 0);
  osc.frequency.setValueAtTime(freq, now);
  // A slight downward glide is what makes it read as a "tock" rather than a
  // beep. `glide` overrides it: 1 holds the pitch, above 1 rises.
  osc.frequency.exponentialRampToValueAtTime(freq * (opts?.glide ?? 0.72), now + dur);
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(env).connect(output(a, opts));
  osc.start(now);
  osc.stop(now + dur);
  osc.onended = release;
}

/**
 * A looping noise source on the shared buffer, for anything sustained — wind,
 * a tyre, an ambient bed. The caller owns it: connect it, start it, stop it.
 */
export function noiseLoop(): AudioBufferSourceNode | null {
  const a = audio();
  if (!a) return null;
  const src = a.ctx.createBufferSource();
  src.buffer = a.noise;
  src.loop = true;
  return src;
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
  toneHit(780, 0.11, 0.11, "sine", { at: 0.07 });
}

/*
 * ── Interface cues ─────────────────────────────────────────────────────────
 *
 * The UI spec's Part 7: a sound on hover, press, confirm, open, close and
 * reject is what separates "a web page" from "a game" more than any visual,
 * and it is a few dozen lines. Synthesised on the same graph as everything
 * else — so the one mute button silences them and a tab with WebAudio blocked
 * plays nothing rather than erroring — and shaped to the spec's table:
 * hover very quiet and high, press a low thunk, confirm a rising two-tone,
 * back/close the same falling, reject dull and low.
 *
 * `sfxUiHover` plays hundreds of times a session. If a player can pick out
 * one instance of it, it is too loud; the gain here is a tenth of a placement.
 */
const UI: HitOptions = { bus: "ui" };

let lastHover = 0;
export function sfxUiHover() {
  const now = performance.now();
  if (now - lastHover < 60) return;
  lastHover = now;
  toneHit(1500, 0.03, 0.018, "sine", UI);
}

export function sfxUiPress() {
  noiseHit(0.05, 380, 0.11, UI);
  toneHit(180, 0.06, 0.07, "sine", UI);
}

export function sfxUiConfirm() {
  toneHit(560, 0.07, 0.09, "triangle", UI);
  toneHit(840, 0.1, 0.08, "triangle", { ...UI, at: 0.055 });
}

export function sfxUiBack() {
  toneHit(700, 0.07, 0.07, "triangle", UI);
  toneHit(470, 0.1, 0.06, "triangle", { ...UI, at: 0.055 });
}

export function sfxUiOpen() {
  toneHit(420, 0.05, 0.07, "sine", UI);
  toneHit(640, 0.09, 0.07, "sine", { ...UI, at: 0.04 });
}

export function sfxUiClose() {
  toneHit(640, 0.05, 0.06, "sine", UI);
  toneHit(420, 0.09, 0.05, "sine", { ...UI, at: 0.04 });
}

/** Dull, low and slightly buzzy: it has to feel wrong, not merely quiet. */
export function sfxUiReject() {
  toneHit(160, 0.12, 0.09, "square", UI);
  noiseHit(0.08, 300, 0.05, UI);
}

/** A soft tick for a slider notch or a counting number. */
export function sfxUiTick() {
  toneHit(1100, 0.025, 0.03, "sine", UI);
}
