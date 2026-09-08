/**
 * The arcade's sound, which is a few oscillators and no files.
 *
 * ── Why synthesised rather than samples ──────────────────────────────────
 *
 * A jump, a coin and a death are three short tones. Shipping them as audio
 * files would add three network requests that can fail, a decode, and a cache
 * story, to produce a noise a dozen lines of WebAudio make exactly. It also
 * makes pitch a parameter, which is what the rising coin streak needs.
 *
 * ── The context is created on the first sound, never at import ───────────
 *
 * Browsers refuse to start an AudioContext without a user gesture and log a
 * warning when you try, so one made at module scope is a warning on every page
 * that imports the arcade — including players who never open a cabinet.
 */

type Voice = { freq: number; to?: number; dur: number; type: OscillatorType; gain: number };

const VOICES: Record<string, Voice> = {
  jump: { freq: 420, to: 640, dur: 0.09, type: "square", gain: 0.05 },
  land: { freq: 180, to: 120, dur: 0.07, type: "triangle", gain: 0.04 },
  coin: { freq: 880, to: 1320, dur: 0.08, type: "square", gain: 0.05 },
  place: { freq: 300, to: 300, dur: 0.05, type: "square", gain: 0.05 },
  perfect: { freq: 990, to: 1480, dur: 0.12, type: "square", gain: 0.06 },
  die: { freq: 220, to: 60, dur: 0.35, type: "sawtooth", gain: 0.07 },
};

let ctx: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (muted) return null;
  if (ctx) return ctx;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Play one named sound. `semitones` shifts it, for streaks that climb.
 *
 * Every node is created per shot and stopped on a schedule rather than pooled:
 * an oscillator is the cheapest object in WebAudio, and a pool of them is a
 * pool of things that can be left running.
 */
export function sfx(name: string, semitones = 0): void {
  const v = VOICES[name];
  const ac = context();
  if (!v || !ac) return;
  if (ac.state === "suspended") void ac.resume();

  const shift = Math.pow(2, semitones / 12);
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = v.type;
  osc.frequency.setValueAtTime(v.freq * shift, t);
  if (v.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.to * shift), t + v.dur);
  }
  // A ramp to zero is not representable on an exponential curve, so the tail
  // lands on a value low enough to be silent and is then cut.
  gain.gain.setValueAtTime(v.gain, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + v.dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Silence the arcade. Also releases the context, so a muted tab costs nothing. */
export function setMuted(next: boolean): void {
  muted = next;
  if (next && ctx) {
    void ctx.close().catch(() => {});
    ctx = null;
  }
}

export const isMuted = () => muted;
